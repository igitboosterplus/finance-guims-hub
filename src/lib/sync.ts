import { getSupabase, isSupabaseConfigured, TABLES } from "./firebase";

// ==================== SYNC ENGINE ====================
// Strategie : localStorage = cache rapide, Supabase = SEULE SOURCE DE VERITE.
//
// REGLES STRICTES :
//   1. Au demarrage : on tire Supabase -> localStorage (Supabase gagne toujours).
//   2. A chaque ecriture : on envoie vers Supabase immediatement (async).
//   3. SUPPRESSION DEFINITIVE : on inscrit l ID dans la table `deleted_ids` de Supabase
//      ET on supprime la ligne dans sa table d origine.
//      Lors de chaque pull, les deleted_ids sont lus EN PREMIER et tout item dont l ID
//      figure dans deleted_ids est exclu - peu importe l appareil ou le navigateur.
//   4. Le localStorage n est JAMAIS une source pour reinjecter des donnees dans Supabase.

type TableName = typeof TABLES[keyof typeof TABLES];
type CriticalTableName = typeof TABLES.transactions | typeof TABLES.users | typeof TABLES.auditLog | typeof TABLES.superAudit;

const STOCK_DEPTS = ['gaba', 'guims-academy', 'guims-educ', 'digitboosterplus'] as const;
const SECURE_WRITE_FUNCTION = (import.meta.env.VITE_SECURE_WRITE_FUNCTION_NAME || 'secure-write').trim();
const ALLOW_INSECURE_DIRECT_SYNC = String(import.meta.env.VITE_ALLOW_INSECURE_DIRECT_SYNC || 'false').toLowerCase() === 'true';
const CRITICAL_TABLES = new Set<CriticalTableName>([
  TABLES.transactions,
  TABLES.users,
  TABLES.auditLog,
  TABLES.superAudit,
]);

function stockStorageKey(dept: string, suffix: string): string {
  return `${dept === 'gaba' ? 'gaba' : dept}-${suffix}`;
}

function isCriticalTable(tableName: TableName): tableName is CriticalTableName {
  return CRITICAL_TABLES.has(tableName as CriticalTableName);
}

async function invokeSecureWrite(body: Record<string, unknown>): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.functions.invoke(SECURE_WRITE_FUNCTION, { body });
    if (error) {
      console.error('[Sync] Secure write invoke error:', error);
      return false;
    }
    if (data && typeof data === 'object' && 'success' in data && data.success === false) {
      console.error('[Sync] Secure write rejected:', data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Sync] Secure write failed:', e);
    return false;
  }
}

// ==================== DELETED IDS (Supabase-persisted) ====================

const LOCAL_TOMBSTONE_KEY = 'guims-sync-tombstones';

function getLocalTombstones(): Set<string> {
  const raw = localStorage.getItem(LOCAL_TOMBSTONE_KEY);
  return raw ? new Set(JSON.parse(raw)) : new Set();
}

function addLocalTombstone(tableName: string, itemId: string) {
  const t = getLocalTombstones();
  t.add(`${tableName}:${itemId}`);
  localStorage.setItem(LOCAL_TOMBSTONE_KEY, JSON.stringify([...t]));
}

let cloudDeletedIds: Set<string> = new Set();

function isDeleted(tableName: string, itemId: string): boolean {
  const key = `${tableName}:${itemId}`;
  return cloudDeletedIds.has(key) || getLocalTombstones().has(key);
}

async function fetchCloudDeletedIds(): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) return new Set();
  try {
    const { data, error } = await sb.from('deleted_ids').select('table_name, item_id');
    if (error) {
      console.warn('[Sync] deleted_ids fetch error (table may not exist yet):', error.message);
      return new Set();
    }
    const result = new Set<string>();
    for (const row of data || []) {
      if (row.table_name && row.item_id) {
        result.add(`${row.table_name}:${row.item_id}`);
      }
    }
    return result;
  } catch (e) {
    console.warn('[Sync] deleted_ids fetch failed:', e);
    return new Set();
  }
}

async function persistDeleteToSupabase(tableName: string, itemId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    if (isCriticalTable(tableName as TableName)) {
      const tombstoneOk = await invokeSecureWrite({
        operation: 'upsert',
        table: 'deleted_ids',
        row: {
          table_name: tableName,
          item_id: itemId,
          deleted_at: new Date().toISOString(),
        },
      });
      const deleteOk = await invokeSecureWrite({
        operation: 'delete_by_id',
        table: tableName,
        id: itemId,
      });
      if (tombstoneOk && deleteOk) {
        cloudDeletedIds.add(`${tableName}:${itemId}`);
        return;
      }
      if (!ALLOW_INSECURE_DIRECT_SYNC) {
        throw new Error('Secure delete required but unavailable');
      }
    }

    await sb.from('deleted_ids').upsert(
      { table_name: tableName, item_id: itemId, deleted_at: new Date().toISOString() },
      { onConflict: 'table_name,item_id' }
    );
    await sb.from(tableName).delete().eq('id', itemId);
    cloudDeletedIds.add(`${tableName}:${itemId}`);
  } catch (e) {
    console.error(`[Sync] Failed to persist delete ${tableName}/${itemId}:`, e);
  }
}

// ==================== PULL (Supabase -> localStorage) ====================

async function pullTable(tableName: TableName, storageKey: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.from(tableName).select("data");
    if (error) throw error;
    const items = (data || [])
      .map((row: any) => row.data)
      .filter((item: any) => item?.id && !isDeleted(tableName, item.id));
    localStorage.setItem(storageKey, JSON.stringify(items));
    return true;
  } catch (err) {
    console.error(`[Sync] Erreur pull ${tableName}:`, err);
    return false;
  }
}

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
      const allItems = (data || [])
        .map((row: any) => row.data)
        .filter((item: any) => item?.id && !isDeleted(tableName, item.id));
      for (const dept of STOCK_DEPTS) {
        const storageKey = stockStorageKey(dept, suffix);
        const deptItems = allItems.filter((item: any) => (item._dept || 'gaba') === dept);
        localStorage.setItem(storageKey, JSON.stringify(deptItems));
      }
    } catch (err) {
      console.error(`[Sync] Erreur pull stock ${tableName}:`, err);
    }
  }
  recalcStockQuantities();
}

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
    const quantityMap = new Map<string, number>();
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
      const tagged = items.map((item: any) => ({ ...item, _dept: dept }));
      pushArrayToSupabase(TABLES.stockItems, tagged).catch(err =>
        console.error(`[Sync] Erreur push recalc ${dept}:`, err)
      );
    }
  }
}

export async function pullAllFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase non configure" };
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase non initialise" };
  try {
    cloudDeletedIds = await fetchCloudDeletedIds();
    await Promise.all([
      pullTable(TABLES.transactions, "finance-transactions"),
      pullTable(TABLES.users, "finance-users"),
      pullTable(TABLES.employees, "finance-employees"),
      pullTable(TABLES.auditLog, "finance-audit-log"),
      pullTable(TABLES.superAudit, "finance-super-audit"),
      pullTable(TABLES.formationsCatalog, "formations-catalog"),
      pullTable(TABLES.paymentPlans, "payment-plans"),
      pullTable(TABLES.enrollments, "formation-enrollments"),
    ]);
    await pullStockTables();
    console.log("[Sync] Pull complet depuis Supabase.");
    return { success: true };
  } catch (error) {
    console.error("[Sync] Erreur pull global:", error);
    return { success: false, error: String(error) };
  }
}

// ==================== PUSH (localStorage -> Supabase) ====================

async function pushArrayToSupabase(tableName: TableName, items: { id: string }[]) {
  const sb = getSupabase();
  if (!sb || items.length === 0) return;

  if (isCriticalTable(tableName)) {
    const ok = await invokeSecureWrite({
      operation: 'upsert_collection',
      table: tableName,
      rows: items.map(item => ({ id: item.id, data: item })),
    });
    if (!ok) {
      if (!ALLOW_INSECURE_DIRECT_SYNC) {
        throw new Error(`Secure write rejected for critical table: ${tableName}`);
      }
      console.warn(`[Sync] Falling back to direct sync for critical table ${tableName} because VITE_ALLOW_INSECURE_DIRECT_SYNC=true`);
    } else {
      return;
    }
  }

  const rows = items.map(item => ({ id: item.id, data: item }));
  const { error } = await sb.from(tableName).upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function pushAllToSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase non configure" };
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase non initialise" };
  try {
    const sharedPairs: [TableName, string][] = [
      [TABLES.transactions, "finance-transactions"],
      [TABLES.users, "finance-users"],
      [TABLES.employees, "finance-employees"],
      [TABLES.auditLog, "finance-audit-log"],
      [TABLES.superAudit, "finance-super-audit"],
      [TABLES.formationsCatalog, "formations-catalog"],
      [TABLES.paymentPlans, "payment-plans"],
      [TABLES.enrollments, "formation-enrollments"],
    ];
    for (const [tableName, storageKey] of sharedPairs) {
      const data = localStorage.getItem(storageKey);
      const items = data ? JSON.parse(data) : [];
      if (Array.isArray(items) && items.length > 0) {
        await pushArrayToSupabase(tableName, items);
      }
    }
    const stockSuffixes: [TableName, string][] = [
      [TABLES.stockItems, 'stock-items'],
      [TABLES.stockMovements, 'stock-movements'],
      [TABLES.trainings, 'trainings'],
      [TABLES.stockKits, 'stock-kits'],
    ];
    for (const [tableName, suffix] of stockSuffixes) {
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
      if (allTagged.length > 0) {
        await pushArrayToSupabase(tableName, allTagged);
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
    TABLES.transactions, TABLES.users, TABLES.employees, TABLES.auditLog, TABLES.superAudit,
    TABLES.stockItems, TABLES.stockMovements, TABLES.trainings,
    TABLES.formationsCatalog, TABLES.paymentPlans, TABLES.stockKits,
    TABLES.enrollments,
  ];
  for (const table of allTables) {
    const { error } = await sb.from(table).delete().neq('id', '___none___');
    if (error) console.error(`[Purge] Erreur suppression ${table}:`, error);
  }
  await sb.from('deleted_ids').delete().neq('item_id', '___none___');
  console.log('[Purge] Toutes les tables Supabase videes.');
}

// ==================== SINGLE DOCUMENT OPERATIONS ====================

export function syncSetDoc(tableName: TableName, item: { id: string }) {
  const sb = getSupabase();
  if (!sb) return;

  if (isCriticalTable(tableName)) {
    invokeSecureWrite({
      operation: 'upsert',
      table: tableName,
      row: { id: item.id, data: item },
    }).then((ok) => {
      if (!ok && ALLOW_INSECURE_DIRECT_SYNC) {
        sb.from(tableName).upsert({ id: item.id, data: item }, { onConflict: "id" })
          .then(({ error }) => {
            if (error) console.error(`[Sync] Erreur ecriture ${tableName}/${item.id}:`, error);
          });
      }
    });
    return;
  }

  sb.from(tableName).upsert({ id: item.id, data: item }, { onConflict: "id" })
    .then(({ error }) => {
      if (error) console.error(`[Sync] Erreur ecriture ${tableName}/${item.id}:`, error);
    });
}

export function syncDeleteDoc(tableName: TableName, itemId: string) {
  addLocalTombstone(tableName, itemId);
  cloudDeletedIds.add(`${tableName}:${itemId}`);
  persistDeleteToSupabase(tableName, itemId);
}

export function syncFullCollection(tableName: TableName, storageKey: string, deptId?: string) {
  const sb = getSupabase();
  if (!sb) return;
  const data = localStorage.getItem(storageKey);
  const items = data ? JSON.parse(data) : [];
  if (!Array.isArray(items) || items.length === 0) return;
  const tagged = deptId ? items.map((item: any) => ({ ...item, _dept: deptId })) : items;
  pushArrayToSupabase(tableName, tagged).catch(err =>
    console.error(`[Sync] Erreur sync collection ${tableName}:`, err)
  );
}
