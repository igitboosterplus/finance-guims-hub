import { getSupabase, isSupabaseConfigured, TABLES } from "./firebase";

// ==================== SYNC ENGINE ====================
// Stratégie : localStorage = source rapide, Supabase = persistance cloud.
// - Au démarrage : Supabase → localStorage (si configuré)
// - À chaque écriture : localStorage → Supabase (async, en arrière-plan)

type TableName = typeof TABLES[keyof typeof TABLES];

// ==================== PULL (Supabase → localStorage) ====================

async function pullTable(tableName: TableName, storageKey: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.from(tableName).select("data");
    if (error) throw error;

    if (data && data.length > 0) {
      // Supabase a des données → c'est la référence cloud → écrire en local
      const items = data.map(row => row.data);
      localStorage.setItem(storageKey, JSON.stringify(items));
      return true;
    }

    // Supabase vide → pousser les données locales si elles existent
    const localRaw = localStorage.getItem(storageKey);
    const localItems: { id: string }[] = localRaw ? JSON.parse(localRaw) : [];
    if (Array.isArray(localItems) && localItems.length > 0) {
      await pushArrayToSupabase(tableName, localItems);
    }

    return true;
  } catch (error) {
    console.error(`[Sync] Erreur pull ${tableName}:`, error);
    return false;
  }
}

export async function pullAllFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase non configuré" };
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase non initialisé" };

  try {
    await Promise.all([
      pullTable(TABLES.transactions, "finance-transactions"),
      pullTable(TABLES.users, "finance-users"),
      pullTable(TABLES.auditLog, "finance-audit-log"),
      pullTable(TABLES.superAudit, "finance-super-audit"),
      pullTable(TABLES.stockItems, "gaba-stock-items"),
      pullTable(TABLES.stockMovements, "gaba-stock-movements"),
      pullTable(TABLES.trainings, "gaba-trainings"),
      pullTable(TABLES.formationsCatalog, "formations-catalog"),
      pullTable(TABLES.paymentPlans, "payment-plans"),
      pullTable(TABLES.stockKits, "gaba-stock-kits"),
    ]);
    console.log("[Sync] Pull complet depuis Supabase.");
    return { success: true };
  } catch (error) {
    console.error("[Sync] Erreur pull global:", error);
    return { success: false, error: String(error) };
  }
}

// ==================== PUSH (localStorage → Supabase) ====================

async function pushArrayToSupabase(tableName: TableName, items: { id: string }[]) {
  const sb = getSupabase();
  if (!sb || items.length === 0) return;
  // Upsert : chaque item est stocké avec son id + blob JSON complet dans "data"
  const rows = items.map(item => ({ id: item.id, data: item }));
  const { error } = await sb.from(tableName).upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function replaceCollection(tableName: TableName, items: { id: string }[]) {
  const sb = getSupabase();
  if (!sb) return;

  // Upsert all current items first (atomic per-item, no data loss window)
  if (items.length > 0) {
    await pushArrayToSupabase(tableName, items);
  }

  // Then remove items that are no longer in the local set
  const localIds = items.map(i => i.id);
  if (localIds.length > 0) {
    // Delete rows whose id is NOT in the local set
    const { error } = await sb.from(tableName).delete().not('id', 'in', `(${localIds.join(',')})`);
    if (error) console.error(`[Sync] Erreur nettoyage ${tableName}:`, error);
  } else {
    // Local is empty → delete all
    const { error } = await sb.from(tableName).delete().neq('id', '___none___');
    if (error) console.error(`[Sync] Erreur suppression ${tableName}:`, error);
  }
}

export async function pushAllToSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase non configuré" };
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase non initialisé" };

  try {
    const pairs: [TableName, string][] = [
      [TABLES.transactions, "finance-transactions"],
      [TABLES.users, "finance-users"],
      [TABLES.auditLog, "finance-audit-log"],
      [TABLES.superAudit, "finance-super-audit"],
      [TABLES.stockItems, "gaba-stock-items"],
      [TABLES.stockMovements, "gaba-stock-movements"],
      [TABLES.trainings, "gaba-trainings"],
      [TABLES.formationsCatalog, "formations-catalog"],
      [TABLES.paymentPlans, "payment-plans"],
      [TABLES.stockKits, "gaba-stock-kits"],
    ];

    for (const [tableName, storageKey] of pairs) {
      const data = localStorage.getItem(storageKey);
      const items = data ? JSON.parse(data) : [];
      if (Array.isArray(items)) {
        await replaceCollection(tableName, items);
      }
    }
    console.log("[Sync] Push complet vers Supabase.");
    return { success: true };
  } catch (error) {
    console.error("[Sync] Erreur push global:", error);
    return { success: false, error: String(error) };
  }
}

// ==================== PURGE ALL SUPABASE DATA ====================

export async function purgeAllSupabase(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const allTables: TableName[] = [
    TABLES.transactions, TABLES.users, TABLES.auditLog, TABLES.superAudit,
    TABLES.stockItems, TABLES.stockMovements, TABLES.trainings,
    TABLES.formationsCatalog, TABLES.paymentPlans, TABLES.stockKits,
  ];
  for (const table of allTables) {
    const { error } = await sb.from(table).delete().neq('id', '___none___');
    if (error) console.error(`[Purge] Erreur suppression ${table}:`, error);
  }
  console.log('[Purge] Toutes les tables Supabase vidées.');
}

// ==================== SINGLE DOCUMENT OPERATIONS ====================

export function syncSetDoc(tableName: TableName, item: { id: string }) {
  const sb = getSupabase();
  if (!sb) return;
  sb.from(tableName).upsert({ id: item.id, data: item }, { onConflict: "id" })
    .then(({ error }) => {
      if (error) console.error(`[Sync] Erreur écriture ${tableName}/${item.id}:`, error);
    });
}

export function syncDeleteDoc(tableName: TableName, itemId: string) {
  const sb = getSupabase();
  if (!sb) return;
  sb.from(tableName).delete().eq("id", itemId)
    .then(({ error }) => {
      if (error) console.error(`[Sync] Erreur suppression ${tableName}/${itemId}:`, error);
    });
}

export function syncFullCollection(tableName: TableName, storageKey: string) {
  const sb = getSupabase();
  if (!sb) return;
  const data = localStorage.getItem(storageKey);
  const items = data ? JSON.parse(data) : [];
  if (!Array.isArray(items)) return;
  // Remplacer entièrement : supprimer tout dans la table puis réinsérer
  replaceCollection(tableName, items).catch(err =>
    console.error(`[Sync] Erreur sync collection ${tableName}:`, err)
  );
}
