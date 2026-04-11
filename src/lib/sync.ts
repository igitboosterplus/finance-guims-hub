import { getSupabase, isSupabaseConfigured, TABLES } from "./firebase";

// ==================== SYNC ENGINE ====================
// Stratégie : localStorage = source rapide, Supabase = persistance cloud.
// - Au démarrage : Supabase → localStorage (si configuré)
// - À chaque écriture : localStorage → Supabase (async, en arrière-plan)
// RÈGLE : Supabase est autoritaire. Local ne gagne que pour les items ABSENTS de Supabase.
// Les suppressions locales sont traquées par des tombstones pour éviter la résurrection.

type TableName = typeof TABLES[keyof typeof TABLES];

// Départements qui ont des tables de stock dédiées
const STOCK_DEPTS = ['gaba', 'guims-academy'] as const;

function stockStorageKey(dept: string, suffix: string): string {
  return `${dept === 'gaba' ? 'gaba' : dept}-${suffix}`;
}

// ==================== DELETION TOMBSTONES ====================
const TOMBSTONE_KEY = 'guims-sync-tombstones';

function getTombstones(): Set<string> {
  const raw = localStorage.getItem(TOMBSTONE_KEY);
  return raw ? new Set(JSON.parse(raw)) : new Set();
}

function addTombstone(tableName: string, itemId: string) {
  const tombstones = getTombstones();
  tombstones.add(`${tableName}:${itemId}`);
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...tombstones]));
}

function isDeleted(tableName: string, itemId: string): boolean {
  return getTombstones().has(`${tableName}:${itemId}`);
}

function clearTombstone(tableName: string, itemId: string) {
  const tombstones = getTombstones();
  tombstones.delete(`${tableName}:${itemId}`);
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...tombstones]));
}

/** Retry deleting all tombstoned items from Supabase */
async function flushTombstones() {
  const sb = getSupabase();
  if (!sb) return;
  const tombstones = getTombstones();
  for (const entry of tombstones) {
    const [tableName, itemId] = entry.split(':');
    if (!tableName || !itemId) continue;
    try {
      const { error } = await sb.from(tableName).delete().eq("id", itemId);
      if (!error) {
        clearTombstone(tableName, itemId);
      }
    } catch {
      // Will retry on next pull
    }
  }
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

    const localRaw = localStorage.getItem(storageKey);
    const localItems: { id: string }[] = localRaw ? JSON.parse(localRaw) : [];

    if (data && data.length > 0) {
      const supabaseItems = data.map(row => row.data);
      const supabaseIds = new Set(supabaseItems.map((item: any) => item.id));

      // Start with Supabase data (authoritative — has changes from all devices)
      const mergedMap = new Map(supabaseItems.map((item: any) => [item.id, item]));

      // Add local-only items (new items not yet in Supabase)
      for (const item of localItems) {
        if (item.id && !supabaseIds.has(item.id)) {
          mergedMap.set(item.id, item);
        }
      }

      // Remove tombstoned items (deleted locally, not yet deleted from Supabase)
      for (const [id] of mergedMap) {
        if (isDeleted(tableName, id)) {
          mergedMap.delete(id);
        }
      }

      const merged = Array.from(mergedMap.values());
      localStorage.setItem(storageKey, JSON.stringify(merged));

      // Push local-only items to Supabase + delete tombstoned items from Supabase
      const localOnly = localItems.filter(item => item.id && !supabaseIds.has(item.id) && !isDeleted(tableName, item.id));
      if (localOnly.length > 0) {
        await pushArrayToSupabase(tableName, localOnly);
      }
      return true;
    }

    // Supabase vide → pousser les données locales si elles existent
    if (Array.isArray(localItems) && localItems.length > 0) {
      // Filter out tombstoned items
      const alive = localItems.filter(item => !isDeleted(tableName, item.id));
      if (alive.length > 0) {
        await pushArrayToSupabase(tableName, alive);
      }
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
          const deptItems = allItems.filter(item => (item?._dept || 'gaba') === dept);

          const localRaw = localStorage.getItem(storageKey);
          const localItems: { id: string }[] = localRaw ? JSON.parse(localRaw) : [];
          const supabaseIds = new Set(deptItems.map((item: any) => item.id));

          if (deptItems.length > 0) {
            // Start with Supabase data (authoritative)
            const mergedMap = new Map(deptItems.map((item: any) => [item.id, item]));

            // Add local-only items (new, not yet in Supabase)
            for (const item of localItems) {
              if (item.id && !supabaseIds.has(item.id)) {
                mergedMap.set(item.id, item);
              }
            }

            // Remove tombstoned items
            for (const [id] of mergedMap) {
              if (isDeleted(tableName, id)) {
                mergedMap.delete(id);
              }
            }

            const merged = Array.from(mergedMap.values());
            localStorage.setItem(storageKey, JSON.stringify(merged));

            // Push local-only items to Supabase
            const localOnly = localItems.filter(item => item.id && !supabaseIds.has(item.id) && !isDeleted(tableName, item.id));
            if (localOnly.length > 0) {
              const tagged = localOnly.map((item: any) => ({ ...item, _dept: dept }));
              await pushArrayToSupabase(tableName, tagged);
            }
          } else if (localItems.length > 0) {
            // Supabase has no items for this dept → preserve local and push
            const alive = localItems.filter(item => !isDeleted(tableName, item.id));
            if (alive.length > 0) {
              const tagged = alive.map(item => ({ ...item, _dept: dept }));
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

  // After pulling all stock data, recalculate currentQuantity from movements
  // This ensures consistency when items and movements come from different devices
  recalcStockQuantities();
}

/**
 * Recalculate currentQuantity on stock items from movements.
 * Ensures consistency after sync (items and movements may come from different devices).
 */
function recalcStockQuantities() {
  for (const dept of STOCK_DEPTS) {
    const itemsKey = stockStorageKey(dept, 'stock-items');
    const movementsKey = stockStorageKey(dept, 'stock-movements');

    const itemsRaw = localStorage.getItem(itemsKey);
    const movementsRaw = localStorage.getItem(movementsKey);
    if (!itemsRaw) continue;

    const items: any[] = JSON.parse(itemsRaw);
    const movements: any[] = movementsRaw ? JSON.parse(movementsRaw) : [];

    if (movements.length === 0) continue;

    // Build quantity map from movements
    const quantityMap = new Map<string, number>();
    // Sort movements by date + createdAt for deterministic ordering
    const sorted = [...movements].sort((a, b) => {
      const da = a.createdAt || a.date || '';
      const db = b.createdAt || b.date || '';
      const cmp = da.localeCompare(db);
      return cmp !== 0 ? cmp : (a.id || '').localeCompare(b.id || '');
    });

    for (const m of sorted) {
      const prev = quantityMap.get(m.itemId) ?? 0;
      if (m.type === 'entry') {
        quantityMap.set(m.itemId, prev + (m.quantity || 0));
      } else if (m.type === 'exit' || m.type === 'training' || m.type === 'gift') {
        quantityMap.set(m.itemId, prev - (m.quantity || 0));
      } else if (m.type === 'adjustment') {
        quantityMap.set(m.itemId, m.newQuantity ?? m.quantity ?? 0);
      }
    }

    let changed = false;
    for (const item of items) {
      if (quantityMap.has(item.id)) {
        const computed = Math.max(0, quantityMap.get(item.id)!);
        if (item.currentQuantity !== computed) {
          item.currentQuantity = computed;
          changed = true;
        }
      }
    }

    if (changed) {
      localStorage.setItem(itemsKey, JSON.stringify(items));
      // Push corrected items to Supabase
      const tagged = items.map((item: any) => ({ ...item, _dept: dept }));
      pushArrayToSupabase(TABLES.stockItems, tagged).catch(err =>
        console.error(`[Sync] Erreur push recalc ${dept}:`, err)
      );
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

    // 3. Retry pending tombstone deletions from Supabase
    await flushTombstones();

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
  // Track deletion so it survives page refresh (won't be resurrected from Supabase)
  addTombstone(tableName, itemId);
  const sb = getSupabase();
  if (!sb) return;
  sb.from(tableName).delete().eq("id", itemId)
    .then(({ error }) => {
      if (error) console.error(`[Sync] Erreur suppression ${tableName}/${itemId}:`, error);
      else clearTombstone(tableName, itemId); // Supabase delete confirmed → clean up tombstone
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
