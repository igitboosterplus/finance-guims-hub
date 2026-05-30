export type UserRole = 'superadmin' | 'admin';

import { syncFullCollection, syncDeleteDoc } from './sync';
import { getSupabase, initSupabase, isSupabaseConfigured, TABLES } from './firebase';
import { STOCK_ENABLED_DEPARTMENT_IDS } from './data';

export interface UserPermissions {
  departments: string[];       // IDs des départements accessibles (vide = aucun)
  stockDepartments: string[];  // IDs des départements dont le stock est accessible
  canCreateTransaction: boolean;
  canEditTransaction: boolean;
  canDeleteTransaction: boolean;
  canRecordStockExitWithoutPrice: boolean;
  canAccessFormations: boolean;
  canAccessPaymentTracking: boolean;
  canAccessAIAccountingChat: boolean;
  canExportData: boolean;
  canImportData: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
  canRestoreAuditEntries: boolean;
  canViewBalanceDelta: boolean;
  canViewSuperAudit: boolean;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  departments: [],
  stockDepartments: [],
  canCreateTransaction: false,
  canEditTransaction: false,
  canDeleteTransaction: false,
  canRecordStockExitWithoutPrice: false,
  canAccessFormations: false,
  canAccessPaymentTracking: false,
  canAccessAIAccountingChat: false,
  canExportData: false,
  canImportData: false,
  canManageUsers: false,
  canViewAudit: false,
  canRestoreAuditEntries: false,
  canViewBalanceDelta: false,
  canViewSuperAudit: false,
};

export const FULL_PERMISSIONS: UserPermissions = {
  departments: ['gaba', 'guims-educ', 'guims-academy', 'digitboosterplus', 'charges-entreprise'],
  stockDepartments: STOCK_ENABLED_DEPARTMENT_IDS,
  canCreateTransaction: true,
  canEditTransaction: true,
  canDeleteTransaction: true,
  canRecordStockExitWithoutPrice: true,
  canAccessFormations: true,
  canAccessPaymentTracking: true,
  canAccessAIAccountingChat: true,
  canExportData: true,
  canImportData: true,
  canManageUsers: true,
  canViewAudit: true,
  canRestoreAuditEntries: true,
  canViewBalanceDelta: true,
  canViewSuperAudit: true,
};

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  approved: boolean;
  createdAt: string;
  permissions?: UserPermissions;
}

export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditLogEntry {
  id: string;
  userId: string;
  username: string;
  action: AuditAction;
  entityType: 'transaction';
  entityId: string;
  details: string;
  previousData?: string;
  newData?: string;
  justification?: string;
  timestamp: string;
  seen: boolean;
  prevHash?: string;
  hash?: string;
}

interface AuditChainStatus {
  ok: boolean;
  brokenAtId?: string;
  message?: string;
}

export interface UserSession {
  userId: string;
  loginAt: string;
}

const USERS_KEY = 'finance-users';
const SESSION_KEY = 'finance-session';
const AUDIT_KEY = 'finance-audit-log';

const PASSWORD_KDF = 'pbkdf2';
const PASSWORD_KDF_ITERATIONS = 120000;
const PASSWORD_SALT_BYTES = 16;
const AUTH_EMAIL_DOMAIN = String(import.meta.env.VITE_SUPABASE_AUTH_EMAIL_DOMAIN || 'auth.guims.local').trim();

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

function authEmailToUsername(email: string): string {
  const [raw] = String(email || '').split('@');
  return normalizeUsername(raw || '');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

// Legacy hash kept for backward compatibility and progressive migration.
async function legacyHashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'guims-salt-2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

async function derivePbkdf2(password: string, saltHex: string, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations,
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);
  const saltHex = bytesToHex(salt);
  const hashHex = await derivePbkdf2(password, saltHex, PASSWORD_KDF_ITERATIONS);
  return `${PASSWORD_KDF}$${PASSWORD_KDF_ITERATIONS}$${saltHex}$${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith(`${PASSWORD_KDF}$`)) {
    const [kdf, iterationsRaw, saltHex, hashHex] = storedHash.split('$');
    if (kdf !== PASSWORD_KDF || !iterationsRaw || !saltHex || !hashHex) return false;
    const iterations = Number.parseInt(iterationsRaw, 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const candidate = await derivePbkdf2(password, saltHex, iterations);
    return candidate === hashHex;
  }
  // Backward compatibility with legacy SHA-256 static-salt hashes.
  return (await legacyHashPassword(password)) === storedHash;
}

function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return 'Mot de passe trop court (min 8 caractères)';
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir au moins une majuscule';
  if (!/[a-z]/.test(password)) return 'Le mot de passe doit contenir au moins une minuscule';
  if (!/\d/.test(password)) return 'Le mot de passe doit contenir au moins un chiffre';
  return null;
}

function getUsers(): User[] {
  const data = localStorage.getItem(USERS_KEY);
  const users: User[] = data ? JSON.parse(data) : [];
  const seenIds = new Set<string>();
  const seenUsernames = new Set<string>();
  const sanitized: User[] = [];

  for (const user of users) {
    const normalized = normalizeUsername(user.username);
    if (seenIds.has(user.id) || seenUsernames.has(normalized)) continue;
    seenIds.add(user.id);
    seenUsernames.add(normalized);
    sanitized.push(user);
  }

  if (sanitized.length !== users.length) {
    localStorage.setItem(USERS_KEY, JSON.stringify(sanitized));
  }

  return sanitized;
}

function saveUsers(users: User[]) {
  const seenIds = new Set<string>();
  const seenUsernames = new Set<string>();
  const sanitized: User[] = [];

  for (const user of users) {
    const normalized = normalizeUsername(user.username);
    if (seenIds.has(user.id) || seenUsernames.has(normalized)) continue;
    seenIds.add(user.id);
    seenUsernames.add(normalized);
    sanitized.push(user);
  }

  localStorage.setItem(USERS_KEY, JSON.stringify(sanitized));
  syncFullCollection(TABLES.users, USERS_KEY);
}

// Startup normalization only.
// Security note: no hardcoded default credentials are created anymore.
export async function initDefaultSuperAdmin() {
  let users = getUsers();

  // Deduplicate users with the same username (keep first occurrence)
  const seen = new Set<string>();
  const deduped = users.filter(u => {
    const key = normalizeUsername(u.username);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length < users.length) {
    saveUsers(deduped);
    users = deduped;
    console.log('[Auth] Removed duplicate user entries.');
  }

  if (users.length === 0) {
    console.warn('[Auth] Aucun compte trouvé. Le premier compte créé deviendra Super Admin.');
  }
}

/** Purge ALL application data from localStorage (users, transactions, stock, audits, etc.).
 *  After purge, initDefaultSuperAdmin will recreate the default account on next load. */
export function purgeAllData(): void {
  const ALL_KEYS = [
    'finance-users',
    'finance-session',
    'finance-audit-log',
    'finance-super-audit',
    'finance-transactions',
    'finance-employees',
    'gaba-stock-items',
    'gaba-stock-movements',
    'gaba-trainings',
    'gaba-stock-kits',
    'guims-academy-stock-items',
    'guims-academy-stock-movements',
    'guims-academy-trainings',
    'guims-academy-stock-kits',
    'formations-catalog',
    'payment-plans',
    'formation-enrollments',
    'finance-seed-done',
    'finance-superadmin-bootstrapped',
    'guims-sync-tombstones',
    'guims-sync-pending-upserts',
    'guims-sync-cloud-seen-tables',
  ];
  for (const key of ALL_KEYS) {
    localStorage.removeItem(key);
  }
  console.log('[Purge] All application data cleared.');
}

export async function login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  const users = getUsers();
  const normalized = normalizeUsername(username);
  const user = users.find(u => normalizeUsername(u.username) === normalized);
  if (!user) return { success: false, error: 'Nom d\'utilisateur inconnu' };

  if (!user.approved) return { success: false, error: 'Votre compte est en attente d\'approbation par le Super Admin' };

  const hasLegacyHash = !user.passwordHash.startsWith(`${PASSWORD_KDF}$`);

  if (isSupabaseConfigured()) {
    const supabase = getSupabase() || initSupabase();
    if (!supabase) {
      return { success: false, error: 'Supabase non initialisé' };
    }

    const email = usernameToAuthEmail(user.username);
    let signInError: string | null = null;

    const signInAttempt = await supabase.auth.signInWithPassword({ email, password });
    if (signInAttempt.error) {
      signInError = signInAttempt.error.message;

      // Backward-compatible migration path:
      // if the user has a valid local password but no Supabase account yet,
      // create auth identity and retry sign in.
      const localPasswordOk = await verifyPassword(password, user.passwordHash);
      if (!localPasswordOk) {
        return { success: false, error: 'Mot de passe incorrect' };
      }

      const signUpResult = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: user.username,
            displayName: user.displayName,
            role: user.role,
          },
        },
      });

      if (signUpResult.error && !/already registered|already been registered/i.test(signUpResult.error.message)) {
        return { success: false, error: `Erreur provisionnement Supabase: ${signUpResult.error.message}` };
      }

      const secondAttempt = await supabase.auth.signInWithPassword({ email, password });
      if (secondAttempt.error) {
        return { success: false, error: signInError || secondAttempt.error.message || 'Connexion Supabase impossible' };
      }
    }
  } else {
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return { success: false, error: 'Mot de passe incorrect' };
  }

  // Transparent migration: upgrade legacy hashes after a successful login.
  if (hasLegacyHash) {
    user.passwordHash = await hashPassword(password);
    saveUsers(users);
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, loginAt: new Date().toISOString() }));
  return { success: true, user };
}

export function logout() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase() || initSupabase();
    if (supabase) {
      supabase.auth.signOut().catch(err => console.warn('[Auth] Supabase signOut failed:', err));
    }
  }
  localStorage.removeItem(SESSION_KEY);
}

export async function syncSessionFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabase() || initSupabase();
  if (!supabase) return;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  const metaUsername = data.user.user_metadata?.username;
  const username = typeof metaUsername === 'string' && metaUsername.trim()
    ? normalizeUsername(metaUsername)
    : authEmailToUsername(data.user.email || '');

  if (!username) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  const users = getUsers();
  const appUser = users.find(u => normalizeUsername(u.username) === username);
  if (!appUser || !appUser.approved) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: appUser.id, loginAt: new Date().toISOString() }));
}

export function getCurrentUser(): User | null {
  const sessionData = localStorage.getItem(SESSION_KEY);
  if (!sessionData) return null;
  try {
    const session = JSON.parse(sessionData);
    const users = getUsers();
    return users.find(u => u.id === session.userId) ?? null;
  } catch {
    return null;
  }
}

export function getCurrentSession(): UserSession | null {
  const sessionData = localStorage.getItem(SESSION_KEY);
  if (!sessionData) return null;
  try {
    const session = JSON.parse(sessionData);
    if (!session?.userId || !session?.loginAt) return null;
    return { userId: session.userId, loginAt: session.loginAt };
  } catch {
    return null;
  }
}

export function isSuperAdmin(user: User | null): boolean {
  return user?.role === 'superadmin';
}

export async function createUser(username: string, password: string, displayName: string, role: UserRole = 'admin'): Promise<{ success: boolean; error?: string }> {
  const users = getUsers();
  const cleanUsername = username.trim();
  const normalized = normalizeUsername(cleanUsername);
  if (users.some(u => normalizeUsername(u.username) === normalized)) {
    return { success: false, error: 'Ce nom d\'utilisateur existe déjà' };
  }
  if (cleanUsername.length < 3) return { success: false, error: 'Nom d\'utilisateur trop court (min 3 caractères)' };
  const passwordPolicyError = validatePasswordPolicy(password);
  if (passwordPolicyError) return { success: false, error: passwordPolicyError };

  const isFirstAccount = users.length === 0;
  const currentUser = getCurrentUser();

  if (!isFirstAccount && role === 'superadmin' && currentUser?.role !== 'superadmin') {
    return { success: false, error: 'Seul un Super Admin peut créer un autre Super Admin' };
  }

  const hash = await hashPassword(password);
  const effectiveRole: UserRole = isFirstAccount ? 'superadmin' : role;
  const newUser: User = {
    id: crypto.randomUUID(),
    username: cleanUsername,
    passwordHash: hash,
    displayName,
    role: effectiveRole,
    approved: isFirstAccount || currentUser?.role === 'superadmin',
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(users);
  return { success: true };
}

export function getAllUsers(): User[] {
  return getUsers();
}

export function approveUser(userId: string) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx].approved = true;
    saveUsers(users);
  }
}

export function rejectUser(userId: string): { success: boolean; error?: string } {
  const users = getUsers();
  const target = users.find(u => u.id === userId);
  if (!target) return { success: false, error: 'Utilisateur introuvable' };

  const normalized = normalizeUsername(target.username);
  const toDeleteIds = users
    .filter(u => u.id === userId || normalizeUsername(u.username) === normalized)
    .map(u => u.id);

  saveUsers(users.filter(u => !toDeleteIds.includes(u.id)));
  toDeleteIds.forEach(id => syncDeleteDoc(TABLES.users, id));
  return { success: true };
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const passwordPolicyError = validatePasswordPolicy(newPassword);
  if (passwordPolicyError) return { success: false, error: passwordPolicyError };
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx].passwordHash = await hashPassword(newPassword);
    saveUsers(users);
    return { success: true };
  }
  return { success: false, error: 'Utilisateur introuvable' };
}

export function deleteUser(userId: string): { success: boolean; error?: string } {
  const users = getUsers();
  const target = users.find(u => u.id === userId);
  if (!target) return { success: false, error: 'Utilisateur introuvable' };

  if (target.role === 'superadmin') {
    const superAdminCount = users.filter(u => u.role === 'superadmin').length;
    if (superAdminCount <= 1) {
      return { success: false, error: 'Impossible de supprimer le dernier Super Admin' };
    }
  }

  const normalized = normalizeUsername(target.username);
  const toDeleteIds = users
    .filter(u => u.id === userId || normalizeUsername(u.username) === normalized)
    .map(u => u.id);

  saveUsers(users.filter(u => !toDeleteIds.includes(u.id)));
  toDeleteIds.forEach(id => syncDeleteDoc(TABLES.users, id));
  return { success: true };
}

export function getUserById(id: string): User | undefined {
  return getUsers().find(u => u.id === id);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const passwordPolicyError = validatePasswordPolicy(newPassword);
  if (passwordPolicyError) return { success: false, error: passwordPolicyError };
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { success: false, error: 'Utilisateur introuvable' };
  const ok = await verifyPassword(currentPassword, users[idx].passwordHash);
  if (!ok) return { success: false, error: 'Mot de passe actuel incorrect' };
  users[idx].passwordHash = await hashPassword(newPassword);
  saveUsers(users);
  return { success: true };
}

export function updateUserProfile(userId: string, displayName: string): { success: boolean; error?: string } {
  if (displayName.trim().length < 2) return { success: false, error: 'Nom trop court (min 2 caractères)' };
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { success: false, error: 'Utilisateur introuvable' };
  users[idx].displayName = displayName.trim();
  saveUsers(users);
  return { success: true };
}

// ==================== PERMISSIONS ====================

export function getUserPermissions(user: User | null): UserPermissions {
  if (!user) return DEFAULT_PERMISSIONS;
  if (user.role === 'superadmin') return FULL_PERMISSIONS;
  return {
    ...DEFAULT_PERMISSIONS,
    ...(user.permissions ?? {}),
    departments: user.permissions?.departments ?? DEFAULT_PERMISSIONS.departments,
    stockDepartments: user.permissions?.stockDepartments ?? DEFAULT_PERMISSIONS.stockDepartments,
  };
}

export function hasPermission(user: User | null, key: keyof Omit<UserPermissions, 'departments' | 'stockDepartments'>): boolean {
  return getUserPermissions(user)[key];
}

export function hasDepartmentAccess(user: User | null, departmentId: string): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const perms = user.permissions ?? DEFAULT_PERMISSIONS;
  return perms.departments.includes(departmentId);
}

export function hasStockAccess(user: User | null, departmentId: string): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const perms = user.permissions ?? DEFAULT_PERMISSIONS;
  return (perms.stockDepartments ?? []).includes(departmentId);
}

export function updateUserPermissions(userId: string, permissions: UserPermissions): { success: boolean; error?: string } {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { success: false, error: 'Utilisateur introuvable' };
  if (users[idx].role === 'superadmin') return { success: false, error: 'Impossible de modifier les permissions du Super Admin' };
  users[idx].permissions = permissions;
  saveUsers(users);
  return { success: true };
}

// ==================== AUDIT LOG ====================

export function getAuditLog(): AuditLogEntry[] {
  const data = localStorage.getItem(AUDIT_KEY);
  const parsed: AuditLogEntry[] = data ? JSON.parse(data) : [];
  const missingChain = parsed.some(entry => !entry.hash || !entry.prevHash);
  if (missingChain && parsed.length > 0) {
    const sealed = sealAuditChain(parsed);
    saveAuditLog(sealed);
    return sealed;
  }
  return parsed;
}

function saveAuditLog(entries: AuditLogEntry[]) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(entries));
  syncFullCollection(TABLES.auditLog, AUDIT_KEY);
}

export function addAuditEntry(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'seen'>) {
  const log = getAuditLog();
  const draft: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    seen: false,
  };
  const prevHash = log.length > 0 ? log[log.length - 1].hash || 'GENESIS' : 'GENESIS';
  draft.prevHash = prevHash;
  draft.hash = computeLocalHash(`${prevHash}|${buildAuditBaseString(draft)}`);
  log.push(draft);
  saveAuditLog(log);

  // Mirror into super audit
  const actionMap: Record<string, SuperAuditAction> = {
    create: 'create_transaction',
    update: 'update_transaction',
    delete: 'delete_transaction',
  };
  addSuperAuditEntry({
    userId: entry.userId,
    username: entry.username,
    action: actionMap[entry.action] ?? 'other',
    details: entry.details,
    targetEntityId: entry.entityId,
  });
}

/** Delete an audit entry and log the deletion in the super audit */
export function deleteAuditEntry(entryId: string, deletedBy: { userId: string; username: string }): boolean {
  addSuperAuditEntry({
    userId: deletedBy.userId,
    username: deletedBy.username,
    action: 'other',
    details: `Tentative refusée: suppression d'audit append-only (entryId=${entryId})`,
    targetEntityId: entryId,
  });
  return false;
}

export function markAuditEntriesSeen() {
  const log = getAuditLog();
  log.forEach(e => e.seen = true);
  saveAuditLog(log);
}

export function getUnseenAuditCount(): number {
  return getAuditLog().filter(e => !e.seen).length;
}

const actionLabelsInternal: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
};

function computeLocalHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildAuditBaseString(entry: Pick<AuditLogEntry, 'id' | 'userId' | 'username' | 'action' | 'entityType' | 'entityId' | 'details' | 'previousData' | 'newData' | 'justification' | 'timestamp' | 'seen'>): string {
  return [
    entry.id,
    entry.userId,
    entry.username,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.details,
    entry.previousData || '',
    entry.newData || '',
    entry.justification || '',
    entry.timestamp,
    String(entry.seen),
  ].join('|');
}

function buildSuperAuditBaseString(entry: Pick<SuperAuditEntry, 'id' | 'userId' | 'username' | 'action' | 'details' | 'targetEntityId' | 'metadata' | 'timestamp'>): string {
  return [
    entry.id,
    entry.userId,
    entry.username,
    entry.action,
    entry.details,
    entry.targetEntityId || '',
    entry.metadata || '',
    entry.timestamp,
  ].join('|');
}

function sealAuditChain(entries: AuditLogEntry[]): AuditLogEntry[] {
  let prevHash = 'GENESIS';
  return entries.map((entry) => {
    const payload = `${prevHash}|${buildAuditBaseString(entry)}`;
    const hash = computeLocalHash(payload);
    const sealed: AuditLogEntry = { ...entry, prevHash, hash };
    prevHash = hash;
    return sealed;
  });
}

function sealSuperAuditChain(entries: SuperAuditEntry[]): SuperAuditEntry[] {
  let prevHash = 'GENESIS';
  return entries.map((entry) => {
    const payload = `${prevHash}|${buildSuperAuditBaseString(entry)}`;
    const hash = computeLocalHash(payload);
    const sealed: SuperAuditEntry = { ...entry, prevHash, hash };
    prevHash = hash;
    return sealed;
  });
}

function verifyAuditChain(entries: AuditLogEntry[]): AuditChainStatus {
  let prevHash = 'GENESIS';
  for (const entry of entries) {
    const expected = computeLocalHash(`${prevHash}|${buildAuditBaseString(entry)}`);
    if (entry.prevHash !== prevHash || entry.hash !== expected) {
      return { ok: false, brokenAtId: entry.id, message: 'Chaîne d\'audit altérée ou incohérente' };
    }
    prevHash = expected;
  }
  return { ok: true };
}

function verifySuperAuditChain(entries: SuperAuditEntry[]): AuditChainStatus {
  let prevHash = 'GENESIS';
  for (const entry of entries) {
    const expected = computeLocalHash(`${prevHash}|${buildSuperAuditBaseString(entry)}`);
    if (entry.prevHash !== prevHash || entry.hash !== expected) {
      return { ok: false, brokenAtId: entry.id, message: 'Chaîne de super audit altérée ou incohérente' };
    }
    prevHash = expected;
  }
  return { ok: true };
}

// ==================== SUPER AUDIT LOG ====================
// Tracks ALL system actions — accessible ONLY by the principal superadmin.
// Cannot be deleted by anyone.

const SUPER_AUDIT_KEY = 'finance-super-audit';

export type SuperAuditAction =
  | 'create_transaction' | 'update_transaction' | 'delete_transaction'
  | 'delete_audit'
  | 'create_user' | 'delete_user' | 'approve_user' | 'reject_user' | 'reset_password' | 'update_permissions'
  | 'login' | 'logout'
  | 'other';

export interface SuperAuditEntry {
  id: string;
  userId: string;
  username: string;
  action: SuperAuditAction;
  details: string;
  targetEntityId?: string;
  metadata?: string;
  timestamp: string;
  prevHash?: string;
  hash?: string;
}

export function getSuperAuditLog(): SuperAuditEntry[] {
  const data = localStorage.getItem(SUPER_AUDIT_KEY);
  const parsed: SuperAuditEntry[] = data ? JSON.parse(data) : [];
  const missingChain = parsed.some(entry => !entry.hash || !entry.prevHash);
  if (missingChain && parsed.length > 0) {
    const sealed = sealSuperAuditChain(parsed);
    saveSuperAuditLog(sealed);
    return sealed;
  }
  return parsed;
}

function saveSuperAuditLog(entries: SuperAuditEntry[]) {
  localStorage.setItem(SUPER_AUDIT_KEY, JSON.stringify(entries));
  syncFullCollection(TABLES.superAudit, SUPER_AUDIT_KEY);
}

export function addSuperAuditEntry(entry: Omit<SuperAuditEntry, 'id' | 'timestamp'>) {
  const log = getSuperAuditLog();
  const draft: SuperAuditEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  const prevHash = log.length > 0 ? log[log.length - 1].hash || 'GENESIS' : 'GENESIS';
  draft.prevHash = prevHash;
  draft.hash = computeLocalHash(`${prevHash}|${buildSuperAuditBaseString(draft)}`);
  log.push(draft);
  saveSuperAuditLog(log);
}

export function getAuditIntegrityStatus(): { audit: AuditChainStatus; superAudit: AuditChainStatus } {
  return {
    audit: verifyAuditChain(getAuditLog()),
    superAudit: verifySuperAuditChain(getSuperAuditLog()),
  };
}

const FIELD_LABELS: Record<string, string> = {
  type: 'Type',
  amount: 'Montant',
  category: 'Catégorie',
  personName: 'Nom',
  date: 'Date',
  paymentMethod: 'Caisse',
  description: 'Description',
};

const TYPE_LABELS: Record<string, string> = { income: 'Revenu', expense: 'Dépense' };
const PAYMENT_LABELS: Record<string, string> = { especes: 'Espèces', momo: 'MTN MoMo', om: 'Orange Money', banque: 'Banque' };

function fmtFieldValue(key: string, value: unknown): string {
  if (key === 'type') return TYPE_LABELS[String(value)] ?? String(value);
  if (key === 'paymentMethod') return PAYMENT_LABELS[String(value)] ?? String(value);
  if (key === 'amount') return Number(value).toLocaleString('fr-FR') + ' FCFA';
  return String(value ?? '');
}

export function buildHumanDiff(previousJson: string, newJson: string): string {
  try {
    const prev = JSON.parse(previousJson);
    const next = JSON.parse(newJson);
    const changes: string[] = [];
    for (const key of Object.keys(FIELD_LABELS)) {
      const oldVal = prev[key];
      const newVal = next[key];
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changes.push(`${FIELD_LABELS[key]}: ${fmtFieldValue(key, oldVal)} → ${fmtFieldValue(key, newVal)}`);
      }
    }
    return changes.length > 0 ? changes.join(' | ') : 'Aucun changement';
  } catch {
    return '';
  }
}
