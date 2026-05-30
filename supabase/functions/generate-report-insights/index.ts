import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AIProvider = "openai" | "gemini";
type AIMode = "report-insights" | "conversation";

interface InsightSection {
  overview: string[];
  strengths: string[];
  risks: string[];
  actions: string[];
}

interface AIReportPayload {
  reportTitle: string;
  periodLabel: string;
  summary: Record<string, unknown>;
  topIncomeCategories: Array<{ label: string; amount: number; share: number }>;
  topExpenseCategories: Array<{ label: string; amount: number; share: number }>;
  strategicExpenses: Array<{ label: string; amount: number; share: number }>;
  paymentMethods: Array<{ label: string; income: number; expenses: number; balance: number }>;
  departmentBalances: Array<{ label: string; income: number; expenses: number; balance: number; count: number }>;
  recentTransactions: Array<{ date: string; type: string; category: string; amount: number; department: string; description: string }>;
}

interface AIConversationPayload {
  question: string;
  context: Record<string, unknown>;
  conversationHistory?: Array<{ role: "user" | "assistant"; text: string }>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

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
  const allowed = parseCsvEnv("AI_ALLOWED_ORIGINS");
  const origin = getOrigin(request);
  if (!origin) return true;
  if (allowed.length > 0) return allowed.includes(origin);
  // Secure-by-default fallback: allow only local development origins when no allowlist is configured.
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function getCorsHeadersForRequest(request: Request): Record<string, string> {
  const origin = getOrigin(request);
  const allowed = parseCsvEnv("AI_ALLOWED_ORIGINS");
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

async function getRoleFromJwt(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    const appRole = data.user.app_metadata?.role;
    const userRole = data.user.user_metadata?.role;
    const role = typeof appRole === "string" ? appRole : (typeof userRole === "string" ? userRole : null);
    return role ? role.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function isRoleAllowed(request: Request, requestedByRole: unknown): Promise<boolean> {
  const allowedRoles = parseCsvEnv("AI_ALLOWED_APP_ROLES").map(role => role.toLowerCase());
  if (allowedRoles.length === 0) return true;

  const roleFromJwt = await getRoleFromJwt(request);
  if (roleFromJwt) {
    return allowedRoles.includes(roleFromJwt);
  }

  // Optional backward-compatible fallback (disabled by default).
  const allowInsecureRoleHeader = (Deno.env.get("AI_ALLOW_INSECURE_ROLE_HEADER") || "false").toLowerCase() === "true";
  if (!allowInsecureRoleHeader) return false;
  if (typeof requestedByRole !== "string") return false;
  return allowedRoles.includes(requestedByRole.toLowerCase());
}

function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENROUTER_API_KEY")) providers.push("openai");
  if (Deno.env.get("GEMINI_API_KEY")) providers.push("gemini");
  return providers;
}

function getDefaultProvider(requested?: string): AIProvider | null {
  if (requested === "openai" && (Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENROUTER_API_KEY"))) return "openai";
  if (requested === "gemini" && Deno.env.get("GEMINI_API_KEY")) return "gemini";

  const preferred = (Deno.env.get("AI_REPORT_PROVIDER") || "").trim().toLowerCase();
  if (preferred === "gemini" && Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (preferred === "openai" && (Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENROUTER_API_KEY"))) return "openai";
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENROUTER_API_KEY")) return "openai";
  return null;
}

function getOpenAICompatConfig() {
  const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";
  const usingOpenRouter = !openAiKey && !!openRouterKey;
  const apiKey = openAiKey || openRouterKey;

  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") || Deno.env.get("OPENROUTER_BASE_URL") || "").trim();
  const apiBase = baseUrl || (usingOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
  const model = (Deno.env.get("OPENAI_MODEL") || "").trim() || (usingOpenRouter ? "openai/gpt-4o-mini" : "gpt-4.1-mini");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (apiBase.includes("openrouter.ai")) {
    const referer = (Deno.env.get("OPENROUTER_SITE_URL") || "").trim();
    const title = (Deno.env.get("OPENROUTER_APP_NAME") || "Guims Finance Hub").trim();
    if (referer) headers["HTTP-Referer"] = referer;
    if (title) headers["X-Title"] = title;
  }

  return { apiKey, model, apiBase, headers };
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function normalizeInsightSection(value: unknown): InsightSection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<InsightSection>;
  const toArray = (items: unknown): string[] => Array.isArray(items)
    ? items.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
    : [];

  const normalized = {
    overview: toArray(candidate.overview),
    strengths: toArray(candidate.strengths),
    risks: toArray(candidate.risks),
    actions: toArray(candidate.actions),
  };

  return normalized.overview.length || normalized.strengths.length || normalized.risks.length || normalized.actions.length
    ? normalized
    : null;
}

function buildPrompt(payload: AIReportPayload): string {
  return [
    "Tu es un analyste financier senior francophone qui écrit pour un dirigeant d'entreprise.",
    "Rédige une synthèse très structurée, exploitable et orientée décision.",
    "Analyse précisément les dépenses globales et fais ressortir les postes comme connexion, communication, hébergement, outils digitaux, publicité, déplacement, matériel, formation, achats et autres charges si présents.",
    "Tu dois fournir des constats chiffrés, des signaux d'alerte et des recommandations exécutables.",
    "Réponds uniquement en JSON strict au format:",
    '{"overview":["..."],"strengths":["..."],"risks":["..."],"actions":["..."]}',
    "Chaque tableau doit contenir entre 2 et 5 éléments, rédigés en français professionnel.",
    "Aucun markdown, aucun texte hors JSON.",
    "Données du rapport:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildConversationPrompt(payload: AIConversationPayload): string {
  const history = Array.isArray(payload.conversationHistory)
    ? payload.conversationHistory
      .slice(-8)
      .map(item => `${item.role === "user" ? "Utilisateur" : "Assistant"}: ${item.text}`)
      .join("\n")
    : "";

  return [
    "Tu es un assistant financier opérationnel pour une application de transactions.",
    "Réponds en français clair, orienté décision, avec chiffres quand possible.",
    "Contrainte importante: ne valide pas un retrait salarial qui dépasserait le salaire mensuel d'un employé.",
    "Format attendu:",
    "1) Impact estimé",
    "2) Risques",
    "3) Recommandation actionnable",
    "Reste concis (6 à 12 lignes).",
    history ? `Historique récent:\n${history}` : "",
    "Contexte transactionnel:",
    JSON.stringify(payload.context || {}, null, 2),
    "Question de l'utilisateur:",
    payload.question,
  ].filter(Boolean).join("\n\n");
}

async function requestOpenAI(payload: AIReportPayload): Promise<InsightSection | null> {
  const { apiKey, model, apiBase, headers } = getOpenAICompatConfig();
  if (!apiKey) return null;

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: "Tu produis uniquement du JSON valide." },
        { role: "user", content: buildPrompt(payload) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`openai: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  const rawJson = extractJsonObject(text);
  if (!rawJson) return null;
  return normalizeInsightSection(JSON.parse(rawJson));
}

async function requestGemini(payload: AIReportPayload): Promise<InsightSection | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.35,
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(payload) }],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`gemini: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n");
  if (typeof text !== "string") return null;
  const rawJson = extractJsonObject(text);
  if (!rawJson) return null;
  return normalizeInsightSection(JSON.parse(rawJson));
}

async function requestOpenAIConversation(payload: AIConversationPayload): Promise<string | null> {
  const { apiKey, model, apiBase, headers } = getOpenAICompatConfig();
  if (!apiKey) return null;

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: "Tu es un conseiller financier. Réponds en texte clair et structuré." },
        { role: "user", content: buildConversationPrompt(payload) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`openai: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return null;
  return text.trim();
}

async function requestGeminiConversation(payload: AIConversationPayload): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "text/plain",
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildConversationPrompt(payload) }],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`gemini: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n");
  if (typeof text !== "string" || !text.trim()) return null;
  return text.trim();
}

Deno.serve(async (request) => {
  const responseHeaders = getCorsHeadersForRequest(request);

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }

  if (!isOriginAllowed(request)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }

  const maxBodyBytes = Number.parseInt(Deno.env.get("AI_MAX_BODY_BYTES") || "200000", 10);
  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }

  const availableProviders = getAvailableProviders();
  if (availableProviders.length === 0) {
    return jsonResponse({ error: "No AI provider configured on server" }, 503);
  }

  try {
    const body = await request.json();
    const mode = (body?.mode as AIMode | undefined) || "report-insights";
    const provider = getDefaultProvider(body?.provider);
    const requestedByRole = body?.requestedByRole;

    if (!(await isRoleAllowed(request, requestedByRole))) {
      return new Response(JSON.stringify({ error: "Role not allowed" }), {
        status: 403,
        headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    if (!provider) {
      return jsonResponse({ error: "Requested provider is not available" }, 400);
    }

    if (mode === "conversation") {
      const payload = body?.payload as AIConversationPayload | undefined;
      if (!payload || typeof payload !== "object" || typeof payload.question !== "string" || !payload.question.trim()) {
        return new Response(JSON.stringify({ error: "Invalid conversation payload" }), {
          status: 400,
          headers: { ...responseHeaders, "Content-Type": "application/json" },
        });
      }
      if (payload.question.length > 1200) {
        return new Response(JSON.stringify({ error: "Question too long" }), {
          status: 400,
          headers: { ...responseHeaders, "Content-Type": "application/json" },
        });
      }

      const reply = provider === "gemini"
        ? await requestGeminiConversation(payload)
        : await requestOpenAIConversation(payload);

      if (!reply) {
        return jsonResponse({ error: "AI conversation response could not be generated" }, 502);
      }

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = body?.payload as AIReportPayload | undefined;
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    const insights = provider === "gemini"
      ? await requestGemini(payload)
      : await requestOpenAI(payload);

    if (!insights) {
      return jsonResponse({ error: "AI response could not be parsed" }, 502);
    }

    return new Response(JSON.stringify(insights), {
      status: 200,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-report-insights]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
      status: 500,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }
});