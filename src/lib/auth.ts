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

// Initialize default super admin if no users exist
export async function initDefaultSuperAdmin() {
  const users = getUsers();
  if (users.length === 0) {
    const hash = await hashPassword('admin123');
    const superAdmin: User = {
      id: crypto.randomUUID(),
      username: 'admin',
      passwordHash: hash,
      displayName: 'Super Admin',
      role: 'superadmin',
      approved: true,
      createdAt: new Date().toISOString(),
    };
    saveUsers([superAdmin]);
  }
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
}

export function markAuditEntriesSeen() {
  const log = getAuditLog();
  log.forEach(e => e.seen = true);
  saveAuditLog(log);
}

export function getUnseenAuditCount(): number {
  return getAuditLog().filter(e => !e.seen).length;
}

export function exportAuditReportCSV(): string {
  const log = getAuditLog();
  const headers = ['Date', 'Utilisateur', 'Action', 'Détails', 'Données précédentes', 'Nouvelles données'];
  const rows = log
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map(e => [
      new Date(e.timestamp).toLocaleString('fr-FR'),
      e.username,
      e.action === 'create' ? 'Création' : e.action === 'update' ? 'Modification' : 'Suppression',
      `"${e.details.replace(/"/g, '""')}"`,
      e.previousData ? `"${e.previousData.replace(/"/g, '""')}"` : '',
      e.newData ? `"${e.newData.replace(/"/g, '""')}"` : '',
    ].join(';'));
  return [headers.join(';'), ...rows].join('\n');
}
