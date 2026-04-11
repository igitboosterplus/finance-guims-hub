import { getSupabase, isSupabaseConfigured, TABLES } from "./firebase";

// ==================== SYNC ENGINE ====================
// Stratégie : localStorage = source rapide, Supabase = persistance cloud.
// - Au démarrage : Supabase → localStorage (si configuré)
// - À chaque écriture : localStorage → Supabase (async, en arrière-plan)
// RÈGLE CRITIQUE : ne JAMAIS écraser localStorage avec des données vides/moins complètes.

type TableName = typeof TABLES[keyof typeof TABLES];

// Départements qui ont des tables de stock dédiées
const STOCK_DEPTS = ['gaba', 'guims-academy'] as const;

function stockStorageKey(dept: string, suffix: string): string {
  return `${dept === 'gaba' ? 'gaba' : dept}-${suffix}`;
}

// ==================== PULL (Supabase → localStorage) ====================

/**
 * Pull a non-departmental table from Supabase → localStorage.
 * If Supabase has data → use it (authoritative).
 * If Supabase empty + local has data → push local to Supabase (first-time seed).
 */
async function pullTable(tableName: TableName, storageKey: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.from(tableName).select("data");
    if (error) throw error;

    if (data && data.length > 0) {
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

/**
 * Pull ALL stock tables (items, movements, trainings, kits) in one pass per table.
 * Fetches once per Supabase table, then splits by _dept into per-department localStorage keys.
 * This avoids duplicate fetches and ensures consistent _dept filtering.
 */
async function pullStockTables(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const stockTableSuffixes: [TableName, string][] = [
    [TABLES.stockItems, 'stock-items'],
    [TABLES.stockMovements, 'stock-movements'],
    [TABLES.trainings, 'trainings'],
    [TABLES.stockKits, 'stock-kits'],
  ];

  for (const [tableName, suffix] of stockTableSuffixes) {
    try {
      const { data, error } = await sb.from(tableName).select("data");
      if (error) throw error;

      if (data && data.length > 0) {
        const allItems = data.map(row => row.data);

        for (const dept of STOCK_DEPTS) {
          const storageKey = stockStorageKey(dept, suffix);
          // Items without _dept default to 'gaba' (backward compat)
          const deptItems = allItems.filter(item => (item?._dept || 'gaba') === dept);
          if (deptItems.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(deptItems));
          } else {
            // Supabase has no items for this dept → preserve local if exists, and push local
            const localRaw = localStorage.getItem(storageKey);
            const localItems: { id: string }[] = localRaw ? JSON.parse(localRaw) : [];
            if (localItems.length > 0) {
              const tagged = localItems.map(item => ({ ...item, _dept: dept }));
              await pushArrayToSupabase(tableName, tagged);
            }
          }
        }
      } else {
        // Supabase table completely empty → push all local data
        for (const dept of STOCK_DEPTS) {
          const storageKey = stockStorageKey(dept, suffix);
          const localRaw = localStorage.getItem(storageKey);
          const localItems: { id: string }[] = localRaw ? JSON.parse(localRaw) : [];
          if (localItems.length > 0) {
            const tagged = localItems.map(item => ({ ...item, _dept: dept }));
            await pushArrayToSupabase(tableName, tagged);
          }
        }
      }
    } catch (error) {
      console.error(`[Sync] Erreur pull stock ${tableName}:`, error);
    }
  }
}

export async function pullAllFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase non configuré" };
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase non initialisé" };

  try {
    // 1. Pull non-departmental tables in parallel
    await Promise.all([
      pullTable(TABLES.transactions, "finance-transactions"),
      pullTable(TABLES.users, "finance-users"),
      pullTable(TABLES.auditLog, "finance-audit-log"),
      pullTable(TABLES.superAudit, "finance-super-audit"),
      pullTable(TABLES.formationsCatalog, "formations-catalog"),
      pullTable(TABLES.paymentPlans, "payment-plans"),
      pullTable(TABLES.enrollments, "formation-enrollments"),
    ]);

    // 2. Pull stock tables (single fetch per table, split by _dept)
    await pullStockTables();

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
    // Non-departmental tables: safe to replaceCollection (cleans up Supabase)
    const sharedPairs: [TableName, string][] = [
      [TABLES.transactions, "finance-transactions"],
      [TABLES.users, "finance-users"],
      [TABLES.auditLog, "finance-audit-log"],
      [TABLES.superAudit, "finance-super-audit"],
      [TABLES.formationsCatalog, "formations-catalog"],
      [TABLES.paymentPlans, "payment-plans"],
      [TABLES.enrollments, "formation-enrollments"],
    ];

    for (const [tableName, storageKey] of sharedPairs) {
      const data = localStorage.getItem(storageKey);
      const items = data ? JSON.parse(data) : [];
      if (Array.isArray(items)) {
        await replaceCollection(tableName, items);
      }
    }

    // Departmental stock tables: gather ALL dept items, then replaceCollection per table
    const stockSuffixes: [TableName, string][] = [
      [TABLES.stockItems, 'stock-items'],
      [TABLES.stockMovements, 'stock-movements'],
      [TABLES.trainings, 'trainings'],
      [TABLES.stockKits, 'stock-kits'],
    ];
    for (const [tableName, suffix] of stockSuffixes) {
      // Collect all items from all departments for this stock table
      const allTagged: { id: string }[] = [];
      for (const dept of STOCK_DEPTS) {
        const storageKey = stockStorageKey(dept, suffix);
        const data = localStorage.getItem(storageKey);
        const items: { id: string }[] = data ? JSON.parse(data) : [];
        if (Array.isArray(items) && items.length > 0) {
          const tagged = items.map(item => ({ ...item, _dept: dept }));
          allTagged.push(...tagged);
        }
      }
      // replaceCollection with ALL dept items combined = safe (no cross-dept loss)
      await replaceCollection(tableName, allTagged);
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
    TABLES.enrollments,
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

/**
 * Sync a localStorage collection to Supabase (upsert only — safe for shared tables).
 * Use syncDeleteDoc() for individual deletions.
 */
export function syncFullCollection(tableName: TableName, storageKey: string, deptId?: string) {
  const sb = getSupabase();
  if (!sb) return;
  const data = localStorage.getItem(storageKey);
  const items = data ? JSON.parse(data) : [];
  if (!Array.isArray(items) || items.length === 0) return;
  // Upsert only — do NOT delete other rows (table may be shared across departments)
  const tagged = deptId ? items.map((item: any) => ({ ...item, _dept: deptId })) : items;
  pushArrayToSupabase(tableName, tagged).catch(err =>
    console.error(`[Sync] Erreur sync collection ${tableName}:`, err)
  );
}
