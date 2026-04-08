import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ==================== SUPABASE CONFIG ====================
// Remplis ces valeurs avec celles de ton projet Supabase :
// 1. Va sur https://supabase.com et crée un projet (gratuit)
// 2. Va dans Settings > API
// 3. Copie "Project URL" et "anon public" key ici
// 4. Dans SQL Editor, exécute le script SQL ci-dessous pour créer les tables

const SUPABASE_URL = "https://xhbxhgymcwbixixipoxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoYnhoZ3ltY3diaXhpeGlwb3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MjE0MzAsImV4cCI6MjA5MDk5NzQzMH0.QL-KtjgfEiJwJlF5xgaqI4kPwxKws2LbS5hiL8EbJU8";

let supabase: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function initSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    console.warn("[Supabase] Config manquante — données stockées en local uniquement.");
    return null;
  }
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[Supabase] Client initialisé.");
    return supabase;
  } catch (error) {
    console.error("[Supabase] Erreur d'initialisation:", error);
    return null;
  }
}

export function getSupabase(): SupabaseClient | null {
  return supabase;
}

// Noms des tables Supabase (à créer dans le SQL Editor)
export const TABLES = {
  transactions: "transactions",
  users: "users",
  stockItems: "stock_items",
  stockMovements: "stock_movements",
  trainings: "trainings",
  auditLog: "audit_log",
  superAudit: "super_audit",
  formationsCatalog: "formations_catalog",
  paymentPlans: "payment_plans",
  stockKits: "stock_kits",
} as const;

// ==================== SQL À EXÉCUTER DANS SUPABASE ====================
// Copie-colle ce SQL dans le SQL Editor de Supabase pour créer les tables :
/*

CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  department_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  payment_method TEXT NOT NULL DEFAULT 'especes',
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  amount INTEGER NOT NULL,
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  quantity INTEGER,
  stock_item_id UUID,
  data JSONB
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  permissions JSONB,
  data JSONB
);

CREATE TABLE stock_items (
  id UUID PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pièce',
  current_quantity INTEGER DEFAULT 0,
  alert_threshold INTEGER DEFAULT 5,
  unit_price INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY,
  item_id UUID REFERENCES stock_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entry', 'exit', 'adjustment')),
  quantity INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  unit_price INTEGER DEFAULT 0,
  reason TEXT DEFAULT '',
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT '',
  data JSONB
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT DEFAULT 'transaction',
  entity_id TEXT DEFAULT '',
  details TEXT DEFAULT '',
  previous_data TEXT,
  new_data TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  seen BOOLEAN DEFAULT FALSE,
  data JSONB
);

-- Désactiver RLS pour commencer (mode test)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON stock_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON stock_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON audit_log FOR ALL USING (true) WITH CHECK (true);

-- ==================== NOUVELLES TABLES ====================

CREATE TABLE formations_catalog (
  id UUID PRIMARY KEY,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_plans (
  id UUID PRIMARY KEY,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_kits (
  id UUID PRIMARY KEY,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE formations_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON formations_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON payment_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON stock_kits FOR ALL USING (true) WITH CHECK (true);

*/
