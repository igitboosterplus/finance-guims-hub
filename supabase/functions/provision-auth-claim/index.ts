import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function getOrigin(request: Request): string {
  return (request.headers.get("origin") || "").trim();
}

function isLocalOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function isOriginAllowed(request: Request): boolean {
  const allowed = parseCsvEnv("AUTH_CLAIM_ALLOWED_ORIGINS");
  const origin = getOrigin(request);
  if (!origin) return true;
  if (allowed.length > 0) return allowed.includes(origin);
  return isLocalOrigin(origin);
}

function getCorsHeadersForRequest(request: Request): Record<string, string> {
  const origin = getOrigin(request);
  const allowed = parseCsvEnv("AUTH_CLAIM_ALLOWED_ORIGINS");
  if (origin) {
    if (allowed.length > 0 && allowed.includes(origin)) {
      return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
    }
    if (allowed.length === 0 && isLocalOrigin(origin)) {
      return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
    }
  }
  return corsHeaders;
}

function getAllowedRoles(): string[] {
  const roles = parseCsvEnv("AUTH_CLAIM_ALLOWED_APP_ROLES").map(role => role.toLowerCase());
  return roles.length > 0 ? roles : ["superadmin", "admin"];
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

  const callerEmailUsername = normalizeUsername(String(authData.user.email || "").split("@")[0] || "");
  if (!callerEmailUsername) {
    return jsonResponse({ error: "Cannot resolve caller username" }, 400, responseHeaders);
  }

  let requestedUsername = callerEmailUsername;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      const maybeUsername = (body as Record<string, unknown>).username;
      if (typeof maybeUsername === "string" && maybeUsername.trim()) {
        requestedUsername = normalizeUsername(maybeUsername);
      }
    }
  } catch {
    // Optional body; ignore parse errors and keep caller-derived username.
  }

  if (requestedUsername !== callerEmailUsername) {
    return jsonResponse({ error: "Claim provisioning is only allowed for current user" }, 403, responseHeaders);
  }

  const { data: matchedUser, error: userError } = await serviceClient
    .from("users")
    .select("username, display_name, role, approved")
    .ilike("username", callerEmailUsername)
    .limit(1)
    .maybeSingle();

  if (userError) {
    return jsonResponse({ error: `Failed to read users table: ${userError.message}` }, 500, responseHeaders);
  }

  if (!matchedUser) {
    return jsonResponse({ error: "No mapped application user found" }, 403, responseHeaders);
  }

  if (!matchedUser.approved) {
    return jsonResponse({ error: "Application user is not approved" }, 403, responseHeaders);
  }

  const role = typeof matchedUser.role === "string" ? matchedUser.role.toLowerCase() : "";
  if (!getAllowedRoles().includes(role)) {
    return jsonResponse({ error: "Role not allowed for privileged claims" }, 403, responseHeaders);
  }

  const existingMetadata = (authData.user.app_metadata && typeof authData.user.app_metadata === "object")
    ? authData.user.app_metadata
    : {};

  const { error: updateError } = await serviceClient.auth.admin.updateUserById(authData.user.id, {
    app_metadata: {
      ...existingMetadata,
      role,
      username: String(matchedUser.username || callerEmailUsername),
      displayName: String(matchedUser.display_name || ""),
    },
  });

  if (updateError) {
    return jsonResponse({ error: `Failed to set app metadata: ${updateError.message}` }, 500, responseHeaders);
  }

  return jsonResponse({ success: true, role }, 200, responseHeaders);
});
