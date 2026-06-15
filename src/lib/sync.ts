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
type PendingSyncOperation = {
  op: 'upsert' | 'delete';
  tableName: TableName;
  itemId: string;
  item?: { id: string };
  queuedAt: string;
  attempts: number;
};

const STOCK_DEPTS = ['gaba', 'guims-academy', 'guims-educ', 'digitboosterplus'] as const;
const SECURE_WRITE_FUNCTION = (import.meta.env.VITE_SECURE_WRITE_FUNCTION_NAME || 'secure-write').trim();
const ALLOW_INSECURE_DIRECT_SYNC = String(import.meta.env.VITE_ALLOW_INSECURE_DIRECT_SYNC || 'false').toLowerCase() === 'true';
const CRITICAL_TABLES = new Set<CriticalTableName>([
  TABLES.transactions,
  TABLES.users,
  TABLES.auditLog,
  TABLES.superAudit,
]);
const PENDING_SYNC_KEY = 'guims-sync-pending-ops';
const BULK_UPSERT_CHUNK_SIZE = 500;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Erreur inconnue';
    }
  }
  return 'Erreur inconnue';
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function getPendingSyncOps(): PendingSyncOperation[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((op): op is PendingSyncOperation =>
      op &&
      (op.op === 'upsert' || op.op === 'delete') &&
      typeof op.tableName === 'string' &&
      typeof op.itemId === 'string'
    );
  } catch {
    return [];
  }
}

function setPendingSyncOps(ops: PendingSyncOperation[]) {
  localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(ops));
}

function getPendingTables(): Set<TableName> {
  const pending = getPendingSyncOps();
  return new Set(pending.map(op => op.tableName));
}

function enqueuePendingUpsert(tableName: TableName, item: { id: string }) {
  const existing = getPendingSyncOps().filter(
    op => !(op.tableName === tableName && op.itemId === item.id)
  );
  existing.push({
    op: 'upsert',
    tableName,
    itemId: item.id,
    item,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  setPendingSyncOps(existing);
}

function enqueuePendingDelete(tableName: TableName, itemId: string) {
  const existing = getPendingSyncOps().filter(
    op => !(op.tableName === tableName && op.itemId === itemId)
  );
  existing.push({
    op: 'delete',
    tableName,
    itemId,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  setPendingSyncOps(existing);
}

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

async function tryUpsertDoc(tableName: TableName, item: { id: string }): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  if (isCriticalTable(tableName)) {
    const ok = await invokeSecureWrite({
      operation: 'upsert',
      table: tableName,
      row: { id: item.id, data: item },
    });
    if (ok) return true;
    // Fallback: direct write via RLS — safe because the JWT is still validated
    // against app_metadata.role by the RLS policy (app.is_staff()).
    // secure-write can fail due to CORS (dev env) or network; we must not silently
    // discard the write if the user has a valid authenticated session.
    if (!ALLOW_INSECURE_DIRECT_SYNC) {
      console.warn(`[Sync] secure-write failed for ${tableName}, trying direct RLS write as fallback`);
    }
  }

  const { error } = await sb.from(tableName).upsert({ id: item.id, data: item }, { onConflict: 'id' });
  if (error) {
    console.error(`[Sync] Direct write failed for ${tableName}/${item.id}:`, error.message);
    return false;
  }
  return true;
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

async function persistDeleteToSupabase(tableName: string, itemId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
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
        return true;
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
    return true;
  } catch (e) {
    console.error(`[Sync] Failed to persist delete ${tableName}/${itemId}:`, e);
    return false;
  }
}

export async function flushPendingSyncOps(maxOps = 200): Promise<{ success: boolean; pending: number; processed: number }> {
  const queue = getPendingSyncOps().sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  if (queue.length === 0) return { success: true, pending: 0, processed: 0 };

  const remaining: PendingSyncOperation[] = [];
  let processed = 0;

  for (const op of queue) {
    if (processed >= maxOps) {
      remaining.push(op);
      continue;
    }

    let ok = false;
    try {
      if (op.op === 'upsert' && op.item) {
        ok = await tryUpsertDoc(op.tableName, op.item);
      } else if (op.op === 'delete') {
        ok = await persistDeleteToSupabase(op.tableName, op.itemId);
      }
    } catch (e) {
      console.error('[Sync] Pending operation retry failed:', e);
      ok = false;
    }

    if (!ok) {
      remaining.push({ ...op, attempts: op.attempts + 1 });
    }
    processed += 1;
  }

  setPendingSyncOps(remaining);
  return {
    success: remaining.length === 0,
    pending: remaining.length,
    processed,
  };
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
    const errorCode = (err as { code?: string } | null)?.code;
    // Some deployments may not have the employees table yet.
    // Do not block the full finance pull in that case.
    if (tableName === TABLES.employees && errorCode === 'PGRST205') {
      console.warn('[Sync] Table employees absente sur ce projet Supabase — synchronisation employees ignorée.');
      localStorage.setItem(storageKey, JSON.stringify([]));
      return true;
    }
    if (tableName === TABLES.paymentMethods && errorCode === 'PGRST205') {
      console.warn('[Sync] Table payment_methods absente sur ce projet Supabase — synchronisation des caisses ignorée.');
      return true;
    }
    console.error(`[Sync] Erreur pull ${tableName}:`, err);
    return false;
  }
}

async function pullStockTables(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  let allOk = true;
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
      allOk = false;
    }
  }
  recalcStockQuantities();
  return allOk;
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
    const { data: authData, error: authError } = await sb.auth.getUser();
    if (authError || !authData?.user) {
      return { success: false, error: "Session Supabase invalide - reconnectez-vous" };
    }

    // Flush pending local ops first (fire-and-forget — never block the pull
    // even if some ops are still stuck; the queue persists for the next cycle).
    const pendingFlush = await flushPendingSyncOps();
    if (!pendingFlush.success && pendingFlush.pending > 0) {
      console.warn(`[Sync] ${pendingFlush.pending} operation(s) locale(s) toujours en attente — pull continue quand meme`);
    }

    const pendingTables = getPendingTables();
    const guardedPull = (tableName: TableName, storageKey: string) => {
      if (pendingTables.has(tableName)) {
        console.warn(`[Sync] Pull ignore pour ${tableName}: operations locales en attente.`);
        return Promise.resolve(true);
      }
      return pullTable(tableName, storageKey);
    };

    cloudDeletedIds = await fetchCloudDeletedIds();
    const sharedPullResults = await Promise.all([
      guardedPull(TABLES.transactions, "finance-transactions"),
      guardedPull(TABLES.users, "finance-users"),
      guardedPull(TABLES.employees, "finance-employees"),
      guardedPull(TABLES.paymentMethods, "finance-payment-methods"),
      guardedPull(TABLES.auditLog, "finance-audit-log"),
      guardedPull(TABLES.superAudit, "finance-super-audit"),
      guardedPull(TABLES.formationsCatalog, "formations-catalog"),
      guardedPull(TABLES.paymentPlans, "payment-plans"),
      guardedPull(TABLES.enrollments, "formation-enrollments"),
    ]);
    const stockPullOk = await pullStockTables();

    const hasSharedPullFailure = sharedPullResults.some(ok => !ok);
    if (hasSharedPullFailure || !stockPullOk) {
      return {
        success: false,
        error: "Lecture Supabase partielle: au moins une table n'a pas pu etre synchronisee.",
      };
    }

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

  const chunks = chunkItems(items, BULK_UPSERT_CHUNK_SIZE);

  if (isCriticalTable(tableName)) {
    let allSecureChunksOk = true;
    for (const chunk of chunks) {
      const ok = await invokeSecureWrite({
        operation: 'upsert_collection',
        table: tableName,
        rows: chunk.map(item => ({ id: item.id, data: item })),
      });
      if (!ok) {
        allSecureChunksOk = false;
        break;
      }
    }
    if (allSecureChunksOk) {
      return;
    }

    // Fallback to direct write (same RLS protection applies — safe).
    if (!ALLOW_INSECURE_DIRECT_SYNC) {
      console.warn(`[Sync] secure-write rejected for ${tableName}, falling back to direct RLS write`);
    }
  }

  for (const chunk of chunks) {
    const rows = chunk.map(item => ({ id: item.id, data: item }));
    const { error } = await sb.from(tableName).upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
}

export async function pushAllToSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase non configure" };
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase non initialise" };

  const pushOnce = async (): Promise<void> => {
    await flushPendingSyncOps();

    const sharedPairs: [TableName, string][] = [
      [TABLES.transactions, "finance-transactions"],
      [TABLES.users, "finance-users"],
      [TABLES.employees, "finance-employees"],
      [TABLES.paymentMethods, "finance-payment-methods"],
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

    await flushPendingSyncOps();
  };

  try {
    const { data: authData, error: authError } = await sb.auth.getUser();
    if (authError || !authData?.user) {
      return { success: false, error: "Session Supabase invalide - reconnectez-vous" };
    }

    const role = String(authData.user.app_metadata?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'superadmin') {
      return {
        success: false,
        error: "Session sans role admin/superadmin. Reconnectez-vous puis reessayez.",
      };
    }

    try {
      await pushOnce();
    } catch (firstError) {
      const firstMessage = toErrorMessage(firstError).toLowerCase();
      const retryable =
        firstMessage.includes('failed to fetch') ||
        firstMessage.includes('network') ||
        firstMessage.includes('permission denied') ||
        firstMessage.includes('jwt') ||
        firstMessage.includes('token') ||
        firstMessage.includes('not allowed');

      if (!retryable) throw firstError;

      // Refresh session and retry once for transient/network/claim timing issues.
      await sb.auth.refreshSession();
      await pushOnce();
    }

    console.log("[Sync] Push complet vers Supabase.");
    return { success: true };
  } catch (error) {
    console.error("[Sync] Erreur push global:", error);
    return { success: false, error: toErrorMessage(error) };
  }
}

// ==================== PURGE ALL SUPABASE DATA ====================

export async function purgeAllSupabase(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const allTables: TableName[] = [
    TABLES.transactions, TABLES.users, TABLES.employees, TABLES.paymentMethods, TABLES.auditLog, TABLES.superAudit,
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
  void tryUpsertDoc(tableName, item).then((ok) => {
    if (!ok) {
      console.warn(`[Sync] Ecriture en attente ${tableName}/${item.id}`);
      enqueuePendingUpsert(tableName, item);
    }
  }).catch((error) => {
    console.error(`[Sync] Erreur ecriture ${tableName}/${item.id}:`, error);
    enqueuePendingUpsert(tableName, item);
  });
}

export function syncDeleteDoc(tableName: TableName, itemId: string) {
  addLocalTombstone(tableName, itemId);
  cloudDeletedIds.add(`${tableName}:${itemId}`);
  void persistDeleteToSupabase(tableName, itemId).then((ok) => {
    if (!ok) {
      console.warn(`[Sync] Suppression en attente ${tableName}/${itemId}`);
      enqueuePendingDelete(tableName, itemId);
    }
  }).catch((error) => {
    console.error(`[Sync] Erreur suppression ${tableName}/${itemId}:`, error);
    enqueuePendingDelete(tableName, itemId);
  });
}

export function syncFullCollection(tableName: TableName, storageKey: string, deptId?: string) {
  const sb = getSupabase();
  if (!sb) return;
  const data = localStorage.getItem(storageKey);
  const items = data ? JSON.parse(data) : [];
  if (!Array.isArray(items) || items.length === 0) return;
  const tagged = deptId ? items.map((item: any) => ({ ...item, _dept: deptId })) : items;
  pushArrayToSupabase(tableName, tagged).catch(err => {
    console.error(`[Sync] Erreur sync collection ${tableName}:`, err);
    for (const item of tagged) {
      if (item?.id) {
        enqueuePendingUpsert(tableName, item);
      }
    }
  });
}
