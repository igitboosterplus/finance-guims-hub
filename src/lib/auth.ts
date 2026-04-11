export type UserRole = 'superadmin' | 'admin';

import { syncFullCollection } from './sync';
import { TABLES } from './firebase';

export interface UserPermissions {
  departments: string[];       // IDs des départements accessibles (vide = aucun)
  canCreateTransaction: boolean;
  canEditTransaction: boolean;
  canExportData: boolean;
  canImportData: boolean;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  departments: [],
  canCreateTransaction: false,
  canEditTransaction: false,
  canExportData: false,
  canImportData: false,
};

export const FULL_PERMISSIONS: UserPermissions = {
  departments: ['gaba', 'guims-educ', 'guims-academy', 'digitboosterplus'],
  canCreateTransaction: true,
  canEditTransaction: true,
  canExportData: true,
  canImportData: true,
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
}

const USERS_KEY = 'finance-users';
const SESSION_KEY = 'finance-session';
const AUDIT_KEY = 'finance-audit-log';

// Simple hash — not cryptographic, but sufficient for a localStorage-based app.
// In a real app this would use bcrypt on a server.
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'guims-salt-2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUsers(): User[] {
  const data = localStorage.getItem(USERS_KEY);
  return data ? JSON.parse(data) : [];
}

function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  syncFullCollection(TABLES.users, USERS_KEY);
}

// Initialize default super admin if no users exist, and deduplicate if needed
export async function initDefaultSuperAdmin() {
  let users = getUsers();

  // Deduplicate users with the same username (keep first occurrence)
  const seen = new Set<string>();
  const deduped = users.filter(u => {
    const key = u.username.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length < users.length) {
    saveUsers(deduped);
    users = deduped;
    console.log('[Auth] Removed duplicate user entries.');
  }

  // Create default superadmin only if NO users exist (after Supabase pull)
  if (users.length === 0 || !users.some(u => u.role === 'superadmin')) {
    const hash = await hashPassword('Yvan2000@');
    const superAdmin: User = {
      id: crypto.randomUUID(),
      username: 'Guimtsop',
      passwordHash: hash,
      displayName: 'Guimtsop',
      role: 'superadmin',
      approved: true,
      createdAt: new Date().toISOString(),
    };
    const final = users.filter(u => u.role !== 'superadmin');
    final.push(superAdmin);
    saveUsers(final);
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
  ];
  for (const key of ALL_KEYS) {
    localStorage.removeItem(key);
  }
  console.log('[Purge] All application data cleared.');
}

export async function login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { success: false, error: 'Nom d\'utilisateur inconnu' };

  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) return { success: false, error: 'Mot de passe incorrect' };

  if (!user.approved) return { success: false, error: 'Votre compte est en attente d\'approbation par le Super Admin' };

  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, loginAt: new Date().toISOString() }));
  return { success: true, user };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
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

export function isSuperAdmin(user: User | null): boolean {
  return user?.role === 'superadmin';
}

export async function createUser(username: string, password: string, displayName: string, role: UserRole = 'admin'): Promise<{ success: boolean; error?: string }> {
  const users = getUsers();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, error: 'Ce nom d\'utilisateur existe déjà' };
  }
  if (username.length < 3) return { success: false, error: 'Nom d\'utilisateur trop court (min 3 caractères)' };
  if (password.length < 6) return { success: false, error: 'Mot de passe trop court (min 6 caractères)' };

  const hash = await hashPassword(password);
  const currentUser = getCurrentUser();
  const newUser: User = {
    id: crypto.randomUUID(),
    username,
    passwordHash: hash,
    displayName,
    role,
    approved: currentUser?.role === 'superadmin',
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

export function rejectUser(userId: string) {
  const users = getUsers();
  saveUsers(users.filter(u => u.id !== userId));
}

export async function resetUserPassword(userId: string, newPassword: string) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx].passwordHash = await hashPassword(newPassword);
    saveUsers(users);
  }
}

export function deleteUser(userId: string) {
  const users = getUsers();
  saveUsers(users.filter(u => u.id !== userId));
}

export function getUserById(id: string): User | undefined {
  return getUsers().find(u => u.id === id);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (newPassword.length < 6) return { success: false, error: 'Nouveau mot de passe trop court (min 6 caractères)' };
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { success: false, error: 'Utilisateur introuvable' };
  const currentHash = await hashPassword(currentPassword);
  if (currentHash !== users[idx].passwordHash) return { success: false, error: 'Mot de passe actuel incorrect' };
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
  return user.permissions ?? DEFAULT_PERMISSIONS;
}

export function hasPermission(user: User | null, key: keyof Omit<UserPermissions, 'departments'>): boolean {
  return getUserPermissions(user)[key];
}

export function hasDepartmentAccess(user: User | null, departmentId: string): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const perms = user.permissions ?? DEFAULT_PERMISSIONS;
  return perms.departments.includes(departmentId);
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
  return data ? JSON.parse(data) : [];
}

function saveAuditLog(entries: AuditLogEntry[]) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(entries));
  syncFullCollection(TABLES.auditLog, AUDIT_KEY);
}

export function addAuditEntry(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'seen'>) {
  const log = getAuditLog();
  log.push({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    seen: false,
  });
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
  const log = getAuditLog();
  const entry = log.find(e => e.id === entryId);
  if (!entry) return false;
  // Log in super audit BEFORE deletion
  addSuperAuditEntry({
    userId: deletedBy.userId,
    username: deletedBy.username,
    action: 'delete_audit',
    details: `Suppression audit: [${actionLabelsInternal[entry.action] ?? entry.action}] ${entry.details}`,
    targetEntityId: entry.entityId,
    metadata: JSON.stringify(entry),
  });
  const filtered = log.filter(e => e.id !== entryId);
  saveAuditLog(filtered);
  return true;
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
}

export function getSuperAuditLog(): SuperAuditEntry[] {
  const data = localStorage.getItem(SUPER_AUDIT_KEY);
  return data ? JSON.parse(data) : [];
}

function saveSuperAuditLog(entries: SuperAuditEntry[]) {
  localStorage.setItem(SUPER_AUDIT_KEY, JSON.stringify(entries));
  syncFullCollection(TABLES.superAudit, SUPER_AUDIT_KEY);
}

export function addSuperAuditEntry(entry: Omit<SuperAuditEntry, 'id' | 'timestamp'>) {
  const log = getSuperAuditLog();
  log.push({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
  saveSuperAuditLog(log);
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
