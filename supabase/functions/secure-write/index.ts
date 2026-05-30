import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Operation = "upsert" | "upsert_collection" | "delete_by_id";

type AllowedTable =
  | "transactions"
  | "users"
  | "audit_log"
  | "super_audit"
  | "deleted_ids";

const ALLOWED_TABLES = new Set<AllowedTable>([
  "transactions",
  "users",
  "audit_log",
  "super_audit",
  "deleted_ids",
]);

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseCsvEnv(name: string): string[] {
  return (Deno.env.get(name) || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function getOrigin(request: Request): string {
  return (request.headers.get("origin") || "").trim();
}

function isOriginAllowed(request: Request): boolean {
  const allowed = parseCsvEnv("SECURE_WRITE_ALLOWED_ORIGINS");
  const origin = getOrigin(request);
  if (!origin) return true;
  if (allowed.length > 0) return allowed.includes(origin);
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function getCorsHeadersForRequest(request: Request): Record<string, string> {
  const origin = getOrigin(request);
  const allowed = parseCsvEnv("SECURE_WRITE_ALLOWED_ORIGINS");
  if (origin) {
    if (allowed.length > 0 && allowed.includes(origin)) {
      return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
    }
    if (allowed.length === 0 && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
    }
  }
  return corsHeaders;
}

function getAllowedRoles(): string[] {
  const roles = parseCsvEnv("SECURE_WRITE_ALLOWED_APP_ROLES").map(role => role.toLowerCase());
  return roles.length > 0 ? roles : ["superadmin", "admin"];
}

function getRoleFromUser(user: { app_metadata?: Record<string, unknown> }): string {
  const appRole = user.app_metadata?.role;
  if (typeof appRole === "string" && appRole) return appRole.toLowerCase();
  return "";
}

function isAllowedTable(value: unknown): value is AllowedTable {
  return typeof value === "string" && ALLOWED_TABLES.has(value as AllowedTable);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  const responseHeaders = getCorsHeadersForRequest(request);

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, responseHeaders);
  }

  if (!isOriginAllowed(request)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, responseHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase environment is not fully configured" }, 500, responseHeaders);
  }

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing bearer token" }, 401, responseHeaders);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) {
    return jsonResponse({ error: "Invalid auth token" }, 401, responseHeaders);
  }

  const role = getRoleFromUser(authData.user);
  if (!getAllowedRoles().includes(role)) {
    return jsonResponse({ error: "Role not allowed" }, 403, responseHeaders);
  }

  const maxBodyBytes = Number.parseInt(Deno.env.get("SECURE_WRITE_MAX_BODY_BYTES") || "250000", 10);
  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return jsonResponse({ error: "Payload too large" }, 413, responseHeaders);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, responseHeaders);
  }

  const operation = body.operation;
  const table = body.table;

  if (!(operation === "upsert" || operation === "upsert_collection" || operation === "delete_by_id")) {
    return jsonResponse({ error: "Invalid operation" }, 400, responseHeaders);
  }

  if (!isAllowedTable(table)) {
    return jsonResponse({ error: "Table not allowed" }, 400, responseHeaders);
  }

  try {
    if (operation === "upsert") {
      const row = body.row;
      if (!isObject(row)) {
        return jsonResponse({ error: "Invalid row payload" }, 400, responseHeaders);
      }
      const { error } = await serviceClient.from(table).upsert(row, { onConflict: "id" });
      if (error) throw error;
      return jsonResponse({ success: true }, 200, responseHeaders);
    }

    if (operation === "upsert_collection") {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return jsonResponse({ error: "Invalid rows payload" }, 400, responseHeaders);
      }
      if (rows.length > 1000) {
        return jsonResponse({ error: "Too many rows in one request" }, 400, responseHeaders);
      }
      const normalizedRows = rows.filter(isObject);
      if (normalizedRows.length !== rows.length) {
        return jsonResponse({ error: "Rows must be objects" }, 400, responseHeaders);
      }
      const { error } = await serviceClient.from(table).upsert(normalizedRows, { onConflict: "id" });
      if (error) throw error;
      return jsonResponse({ success: true, count: normalizedRows.length }, 200, responseHeaders);
    }

    const id = body.id;
    if (typeof id !== "string" || !id.trim()) {
      return jsonResponse({ error: "Invalid id" }, 400, responseHeaders);
    }
    const { error } = await serviceClient.from(table).delete().eq("id", id);
    if (error) throw error;
    return jsonResponse({ success: true }, 200, responseHeaders);
  } catch (error) {
    console.error("[secure-write]", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 500, responseHeaders);
  }
});
