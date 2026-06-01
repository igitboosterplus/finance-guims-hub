import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Operation = "create_user" | "reset_password";
type AllowedRole = "superadmin" | "admin";

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
  const allowed = parseCsvEnv("AUTH_ADMIN_ALLOWED_ORIGINS");
  const origin = getOrigin(request);
  if (!origin) return true;
  if (allowed.length > 0) return allowed.includes(origin);
  // Default: allow localhost (dev) AND any HTTPS origin (production web apps).
  return isLocalOrigin(origin) || origin.startsWith("https://");
}

function getCorsHeadersForRequest(request: Request): Record<string, string> {
  const origin = getOrigin(request);
  const allowed = parseCsvEnv("AUTH_ADMIN_ALLOWED_ORIGINS");
  if (origin) {
    if (allowed.length > 0 && allowed.includes(origin)) {
      return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
    }
    if (allowed.length === 0 && (isLocalOrigin(origin) || origin.startsWith("https://"))) {
      return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
    }
  }
  return corsHeaders;
}

function getAllowedRoles(): AllowedRole[] {
  const roles = parseCsvEnv("AUTH_ADMIN_ALLOWED_APP_ROLES")
    .map(role => role.toLowerCase())
    .filter((role): role is AllowedRole => role === "superadmin" || role === "admin");
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

function validateOperation(value: unknown): value is Operation {
  return value === "create_user" || value === "reset_password";
}

function validateTargetRole(value: unknown): value is AllowedRole {
  return value === "superadmin" || value === "admin";
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
  const authEmailDomain = (Deno.env.get("AUTH_EMAIL_DOMAIN") || "auth.guims.local").trim();

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

  const callerRoleRaw = authData.user.app_metadata?.role;
  const callerRole = typeof callerRoleRaw === "string" ? callerRoleRaw.toLowerCase() : "";
  if (!getAllowedRoles().includes(callerRole as AllowedRole)) {
    return jsonResponse({ error: "Role not allowed" }, 403, responseHeaders);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, responseHeaders);
  }

  const operation = body.operation;
  if (!validateOperation(operation)) {
    return jsonResponse({ error: "Invalid operation" }, 400, responseHeaders);
  }

  if (operation === "create_user") {
    const usernameRaw = body.username;
    const passwordRaw = body.password;
    const displayNameRaw = body.displayName;
    const roleRaw = body.role;

    if (typeof usernameRaw !== "string" || !usernameRaw.trim()) {
      return jsonResponse({ error: "Invalid username" }, 400, responseHeaders);
    }
    if (typeof passwordRaw !== "string" || passwordRaw.length < 8) {
      return jsonResponse({ error: "Invalid password" }, 400, responseHeaders);
    }
    if (typeof displayNameRaw !== "string" || !displayNameRaw.trim()) {
      return jsonResponse({ error: "Invalid displayName" }, 400, responseHeaders);
    }
    if (!validateTargetRole(roleRaw)) {
      return jsonResponse({ error: "Invalid role" }, 400, responseHeaders);
    }

    if (roleRaw === "superadmin" && callerRole !== "superadmin") {
      return jsonResponse({ error: "Only superadmin can create superadmin" }, 403, responseHeaders);
    }

    const username = normalizeUsername(usernameRaw);
    const email = `${username}@${authEmailDomain}`;

    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password: passwordRaw,
      email_confirm: true,
      app_metadata: {
        role: roleRaw,
        username,
        displayName: displayNameRaw.trim(),
      },
      user_metadata: {
        username,
        displayName: displayNameRaw.trim(),
      },
    });

    if (error && !/already registered|already been registered/i.test(error.message)) {
      return jsonResponse({ error: error.message }, 500, responseHeaders);
    }

    return jsonResponse({ success: true, userId: data?.user?.id || null }, 200, responseHeaders);
  }

  const usernameRaw = body.username;
  const newPasswordRaw = body.newPassword;

  if (typeof usernameRaw !== "string" || !usernameRaw.trim()) {
    return jsonResponse({ error: "Invalid username" }, 400, responseHeaders);
  }
  if (typeof newPasswordRaw !== "string" || newPasswordRaw.length < 8) {
    return jsonResponse({ error: "Invalid new password" }, 400, responseHeaders);
  }

  const username = normalizeUsername(usernameRaw);
  const email = `${username}@${authEmailDomain}`;

  const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return jsonResponse({ error: listError.message }, 500, responseHeaders);
  }

  const target = (listData?.users || []).find(user => String(user.email || "").toLowerCase() === email);
  if (!target) {
    return jsonResponse({ error: "Auth user not found" }, 404, responseHeaders);
  }

  const targetRoleRaw = target.app_metadata?.role;
  const targetRole = typeof targetRoleRaw === "string" ? targetRoleRaw.toLowerCase() : "";
  if (targetRole === "superadmin" && callerRole !== "superadmin") {
    return jsonResponse({ error: "Only superadmin can reset superadmin password" }, 403, responseHeaders);
  }

  const { error: updateError } = await serviceClient.auth.admin.updateUserById(target.id, {
    password: newPasswordRaw,
  });
  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500, responseHeaders);
  }

  return jsonResponse({ success: true }, 200, responseHeaders);
});
