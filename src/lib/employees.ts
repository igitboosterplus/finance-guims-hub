import { syncDeleteDoc, syncSetDoc } from './sync';
import { TABLES } from './firebase';
import { getTransactions, type DepartmentId, type Transaction } from './data';

const EMPLOYEES_KEY = 'finance-employees';

export interface Employee {
  id: string;
  departmentId: DepartmentId;
  workDepartmentIds: DepartmentId[];
  fullName: string;
  roles: string[];
  phoneNumber?: string;
  monthlySalary?: number;
  status: 'actif' | 'inactif';
  hireDate?: string;
  notes?: string;
  createdAt: string;
}

export interface EmployeeInput {
  departmentId: DepartmentId;
  workDepartmentIds: DepartmentId[];
  fullName: string;
  roles: string[];
  phoneNumber?: string;
  monthlySalary?: number;
  status?: 'actif' | 'inactif';
  hireDate?: string;
  notes?: string;
}

export function getEmployees(): Employee[] {
  const raw = localStorage.getItem(EMPLOYEES_KEY);
  const items: Array<Employee & { workDepartmentId?: DepartmentId; role?: string }> = raw ? JSON.parse(raw) : [];
  return items.map(item => ({
    ...item,
    workDepartmentIds: item.workDepartmentIds && item.workDepartmentIds.length > 0
      ? item.workDepartmentIds
      : [item.workDepartmentId || item.departmentId],
    roles: item.roles && item.roles.length > 0
      ? item.roles
      : item.role
        ? [item.role]
        : [],
  }));
}

function saveEmployees(items: Employee[]) {
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(items));
}

export function getEmployeesByDepartment(departmentId: DepartmentId): Employee[] {
  return getEmployees()
    .filter(item => item.departmentId === departmentId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr', { sensitivity: 'base' }));
}

export function getActiveEmployeesByDepartment(departmentId: DepartmentId): Employee[] {
  return getEmployeesByDepartment(departmentId).filter(item => item.status === 'actif');
}

export function addEmployee(input: EmployeeInput): Employee {
  const items = getEmployees();
  const employee: Employee = {
    id: crypto.randomUUID(),
    departmentId: input.departmentId,
    workDepartmentIds: input.workDepartmentIds,
    fullName: input.fullName.trim(),
    roles: input.roles.map(role => role.trim()).filter(Boolean),
    phoneNumber: input.phoneNumber?.trim() || undefined,
    monthlySalary: input.monthlySalary && input.monthlySalary > 0 ? input.monthlySalary : undefined,
    status: input.status || 'actif',
    hireDate: input.hireDate || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  items.push(employee);
  saveEmployees(items);
  syncSetDoc(TABLES.employees, employee);
  return employee;
}

export function updateEmployee(id: string, updates: Partial<EmployeeInput>): Employee | null {
  const items = getEmployees();
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return null;

  items[index] = {
    ...items[index],
    ...(updates.workDepartmentIds !== undefined ? { workDepartmentIds: updates.workDepartmentIds } : {}),
    ...(updates.fullName !== undefined ? { fullName: updates.fullName.trim() } : {}),
    ...(updates.roles !== undefined ? { roles: updates.roles.map(role => role.trim()).filter(Boolean) } : {}),
    ...(updates.phoneNumber !== undefined ? { phoneNumber: updates.phoneNumber.trim() || undefined } : {}),
    ...(updates.monthlySalary !== undefined ? { monthlySalary: updates.monthlySalary && updates.monthlySalary > 0 ? updates.monthlySalary : undefined } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.hireDate !== undefined ? { hireDate: updates.hireDate || undefined } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes.trim() || undefined } : {}),
  };

  saveEmployees(items);
  syncSetDoc(TABLES.employees, items[index]);
  return items[index];
}

export function deleteEmployee(id: string): boolean {
  const items = getEmployees();
  const next = items.filter(item => item.id !== id);
  if (next.length === items.length) return false;
  saveEmployees(next);
  syncDeleteDoc(TABLES.employees, id);
  return true;
}

export function findEmployeeByName(departmentId: DepartmentId, fullName: string): Employee | null {
  const normalized = fullName.trim().toLowerCase();
  return getEmployeesByDepartment(departmentId).find(item => item.fullName.trim().toLowerCase() === normalized) || null;
}

function isEmployeePaymentTransaction(tx: Transaction): boolean {
  return tx.departmentId === 'charges-entreprise' && tx.type === 'expense' && tx.category === 'Paiement employés';
}

export function getEmployeeLastPaymentDate(employee: Employee): string | null {
  const normalizedName = employee.fullName.trim().toLowerCase();
  const lastPayment = getTransactions()
    .filter(tx => isEmployeePaymentTransaction(tx) && tx.personName.trim().toLowerCase() === normalizedName)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return lastPayment?.date || null;
}