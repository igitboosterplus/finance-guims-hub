export type AIProvider = "openai" | "gemini";

export interface InsightSection {
  overview: string[];
  strengths: string[];
  risks: string[];
  actions: string[];
}

export interface AIReportPayload {
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

import { getSupabase, initSupabase, isSupabaseConfigured } from "./firebase";
import { getCurrentUser } from "./auth";

const EDGE_FUNCTION_NAME = "generate-report-insights";

function getAvailableProviders(): AIProvider[] {
  const raw = import.meta.env.VITE_AI_REPORT_AVAILABLE_PROVIDERS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter((value): value is AIProvider => value === "openai" || value === "gemini");
}

function getDefaultProvider(): AIProvider | null {
  const preferred = import.meta.env.VITE_AI_REPORT_PROVIDER?.trim().toLowerCase();
  const available = getAvailableProviders();
  if (preferred === "gemini" && available.includes("gemini")) return "gemini";
  if (preferred === "openai" && available.includes("openai")) return "openai";
  if (available.includes("gemini")) return "gemini";
  if (available.includes("openai")) return "openai";
  return null;
}

export function getConfiguredAIProviders(): AIProvider[] {
  return isSupabaseConfigured() ? getAvailableProviders() : [];
}

export function getPreferredAIProvider(): AIProvider | null {
  return getDefaultProvider();
}

function normalizeInsightSection(value: unknown): InsightSection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<InsightSection>;
  const asArray = (items: unknown): string[] => Array.isArray(items)
    ? items.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
    : [];

  return {
    overview: asArray(candidate.overview),
    strengths: asArray(candidate.strengths),
    risks: asArray(candidate.risks),
    actions: asArray(candidate.actions),
  };
}

export async function generateExternalAIInsights(payload: AIReportPayload, provider?: AIProvider | null): Promise<InsightSection | null> {
  const chosenProvider = provider || getDefaultProvider();
  if (!chosenProvider || !isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabase() || initSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
      body: {
        provider: chosenProvider,
        payload,
        requestedByRole: getCurrentUser()?.role,
        requestedByUser: getCurrentUser()?.username,
      },
    });

    if (error) {
      throw error;
    }

    return normalizeInsightSection(data);
  } catch (error) {
    console.warn("[AI Report] External insight generation failed", error);
    return null;
  }
}