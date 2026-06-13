import logoGaba from '@/assets/logo-gaba.png';
import logoGuimsEduc from '@/assets/logo-guims-educ.jpg';
import logoGuimsAcademy from '@/assets/logo-guims-academy.jpg';
import logoDigitbooster from '@/assets/logo-digitbooster.png';
import logoGuimsGroup from '@/assets/logo-guims-group.jpg';
import { syncSetDoc, syncDeleteDoc, syncFullCollection, pushAllToSupabase } from './sync';
import { TABLES } from './firebase';
import { normalizeTransactionDate, getTransactionTimestamp } from './transactionDates';

export type DepartmentId = 'gaba' | 'guims-educ' | 'guims-academy' | 'digitboosterplus' | 'charges-entreprise';

export interface Department {
  id: DepartmentId;
  name: string;
  description: string;
  logo: string;
  colorClass: string;
  bgClass: string;
  bgLightClass: string;
  incomeCategories: string[];
  expenseCategories: string[];
}

export type PaymentMethod = string;

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  departmentIds: DepartmentId[];
  system?: boolean;
}

export type IncomeNature = 'operational' | 'external-contribution';

const PAYMENT_METHODS_STORAGE_KEY = 'finance-payment-methods';
const ALL_DEPARTMENT_IDS: DepartmentId[] = ['gaba', 'guims-educ', 'guims-academy', 'digitboosterplus', 'charges-entreprise'];
const SHARED_PAYMENT_METHOD_VALUES = new Set<PaymentMethod>(['especes', 'banque']);

const DEFAULT_PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { value: 'especes', label: 'Espèces', departmentIds: ALL_DEPARTMENT_IDS, system: true },
  { value: 'banque', label: 'Banque', departmentIds: ALL_DEPARTMENT_IDS, system: true },
  { value: 'momo', label: 'MoMo (ancien non affecté)', departmentIds: [], system: true },
  { value: 'om', label: 'OM (ancien non affecté)', departmentIds: [], system: true },
  { value: 'momo-gaba', label: 'MoMo GABA', departmentIds: ['gaba'], system: true },
  { value: 'om-gaba', label: 'OM GABA', departmentIds: ['gaba'], system: true },
  { value: 'momo-guims-educ', label: 'MoMo Guims Educ', departmentIds: ['guims-educ'], system: true },
  { value: 'om-guims-educ', label: 'OM Guims Educ', departmentIds: ['guims-educ'], system: true },
  { value: 'momo-guims-academy', label: 'MoMo Guims Academy', departmentIds: ['guims-academy'], system: true },
  { value: 'om-guims-academy', label: 'OM Guims Academy', departmentIds: ['guims-academy'], system: true },
  { value: 'momo-digitboosterplus', label: 'MoMo DigitBoosterPlus', departmentIds: ['digitboosterplus'], system: true },
  { value: 'om-digitboosterplus', label: 'OM DigitBoosterPlus', departmentIds: ['digitboosterplus'], system: true },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = DEFAULT_PAYMENT_METHOD_OPTIONS.map(({ value, label }) => ({ value, label }));

const DEFAULT_PAYMENT_METHOD_ORDER = new Map(DEFAULT_PAYMENT_METHOD_OPTIONS.map((option, index) => [option.value, index]));

function isDepartmentId(value: unknown): value is DepartmentId {
  return typeof value === 'string' && ALL_DEPARTMENT_IDS.includes(value as DepartmentId);
}

function uniqueDepartmentIds(ids: DepartmentId[]): DepartmentId[] {
  return Array.from(new Set(ids));
}

function normalizeStoredPaymentMethodOption(value: unknown): PaymentMethodOption | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<PaymentMethodOption>;
  if (typeof item.value !== 'string' || typeof item.label !== 'string') return null;
  const departmentIds = Array.isArray(item.departmentIds)
    ? uniqueDepartmentIds(item.departmentIds.filter(isDepartmentId))
    : [];
  return {
    value: item.value,
    label: item.label.trim(),
    departmentIds,
    system: item.system === true,
  };
}

function sortPaymentMethods(items: PaymentMethodOption[]): PaymentMethodOption[] {
  return [...items].sort((left, right) => {
    const leftOrder = DEFAULT_PAYMENT_METHOD_ORDER.get(left.value);
    const rightOrder = DEFAULT_PAYMENT_METHOD_ORDER.get(right.value);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1;
      if (rightOrder === undefined) return -1;
      return leftOrder - rightOrder;
    }
    return left.label.localeCompare(right.label, 'fr', { sensitivity: 'base' });
  });
}

function mergePaymentMethodOptions(storedOptions: PaymentMethodOption[]): PaymentMethodOption[] {
  const merged = new Map<PaymentMethod, PaymentMethodOption>();
  for (const option of DEFAULT_PAYMENT_METHOD_OPTIONS) {
    merged.set(option.value, { ...option, departmentIds: [...option.departmentIds] });
  }
  for (const option of storedOptions) {
    if (merged.has(option.value) && merged.get(option.value)?.system) continue;
    merged.set(option.value, {
      value: option.value,
      label: option.label,
      departmentIds: uniqueDepartmentIds(option.departmentIds),
      system: option.system === true,
    });
  }
  return sortPaymentMethods(Array.from(merged.values()));
}

function savePaymentMethods(options: PaymentMethodOption[]) {
  localStorage.setItem(PAYMENT_METHODS_STORAGE_KEY, JSON.stringify(options));
  syncFullCollection(TABLES.paymentMethods, PAYMENT_METHODS_STORAGE_KEY);
}

export function getAllPaymentMethods(): PaymentMethodOption[] {
  const raw = localStorage.getItem(PAYMENT_METHODS_STORAGE_KEY);
  const storedOptions = raw
    ? (() => {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed)
            ? parsed.map(normalizeStoredPaymentMethodOption).filter((option): option is PaymentMethodOption => option !== null)
            : [];
        } catch {
          return [];
        }
      })()
    : [];

  const mergedOptions = mergePaymentMethodOptions(storedOptions);
  const shouldPersist = !raw || JSON.stringify(storedOptions) !== JSON.stringify(mergedOptions);
  if (shouldPersist) {
    localStorage.setItem(PAYMENT_METHODS_STORAGE_KEY, JSON.stringify(mergedOptions));
  }
  return mergedOptions;
}

function isPaymentMethodAvailableForDepartment(option: PaymentMethodOption, departmentId: DepartmentId): boolean {
  if (departmentId === 'charges-entreprise') {
    return SHARED_PAYMENT_METHOD_VALUES.has(option.value) || option.departmentIds.length > 0;
  }
  return SHARED_PAYMENT_METHOD_VALUES.has(option.value) || option.departmentIds.includes(departmentId);
}

export const getPaymentMethodsForDepartment = (departmentId?: DepartmentId): { value: PaymentMethod; label: string }[] => {
  const methods = getAllPaymentMethods();
  const filtered = departmentId
    ? methods.filter(option => isPaymentMethodAvailableForDepartment(option, departmentId))
    : methods;
  return filtered.map(method => ({ value: method.value, label: getPaymentMethodLabel(method.value, departmentId) }));
};

function slugifyPaymentMethodLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createPaymentMethod(label: string, departmentIds: DepartmentId[]): { success: boolean; error?: string; method?: PaymentMethodOption } {
  const normalizedLabel = label.trim();
  if (normalizedLabel.length < 2) {
    return { success: false, error: 'Le nom de la caisse est trop court.' };
  }

  const normalizedDepartmentIds = uniqueDepartmentIds(departmentIds.filter(isDepartmentId));
  if (normalizedDepartmentIds.length === 0) {
    return { success: false, error: 'Sélectionnez au moins un département pour cette caisse.' };
  }

  const existing = getAllPaymentMethods();
  if (existing.some(method => method.label.localeCompare(normalizedLabel, 'fr', { sensitivity: 'base' }) === 0)) {
    return { success: false, error: 'Une caisse avec ce nom existe déjà.' };
  }

  const baseValue = slugifyPaymentMethodLabel(normalizedLabel) || 'caisse';
  let candidate = `custom-${baseValue}`;
  let suffix = 2;
  while (existing.some(method => method.value === candidate)) {
    candidate = `custom-${baseValue}-${suffix}`;
    suffix += 1;
  }

  const method: PaymentMethodOption = {
    value: candidate,
    label: normalizedLabel,
    departmentIds: normalizedDepartmentIds,
    system: false,
  };

  savePaymentMethods(sortPaymentMethods([...existing, method]));
  return { success: true, method };
}

function hasPaymentMethodUsage(value: PaymentMethod): boolean {
  if (getTransactions().some(transaction => transaction.paymentMethod === value)) {
    return true;
  }

  try {
    const rawPlans = localStorage.getItem('payment-plans');
    if (!rawPlans) return false;
    const plans = JSON.parse(rawPlans);
    if (!Array.isArray(plans)) return false;
    return plans.some(plan =>
      Array.isArray(plan?.installments) && plan.installments.some((installment: { paymentMethod?: string }) => installment?.paymentMethod === value)
    );
  } catch {
    return false;
  }
}

export function deletePaymentMethod(value: PaymentMethod): { success: boolean; error?: string } {
  const methods = getAllPaymentMethods();
  const target = methods.find(method => method.value === value);
  if (!target) {
    return { success: false, error: 'Caisse introuvable.' };
  }
  if (target.system) {
    return { success: false, error: 'Les caisses système ne peuvent pas être supprimées.' };
  }
  if (hasPaymentMethodUsage(value)) {
    return { success: false, error: 'Impossible de supprimer une caisse déjà utilisée dans des opérations ou des paiements.' };
  }

  const updated = methods.filter(method => method.value !== value);
  savePaymentMethods(updated);
  syncDeleteDoc(TABLES.paymentMethods, value);
  return { success: true };
}

export const normalizePaymentMethod = (method: PaymentMethod, departmentId?: DepartmentId): PaymentMethod => {
  if (method === 'momo' && departmentId && departmentId !== 'charges-entreprise') {
    const mapped = {
      'gaba': 'momo-gaba',
      'guims-educ': 'momo-guims-educ',
      'guims-academy': 'momo-guims-academy',
      'digitboosterplus': 'momo-digitboosterplus',
    } as const;
    return mapped[departmentId] ?? method;
  }
  if (method === 'om' && departmentId && departmentId !== 'charges-entreprise') {
    const mapped = {
      'gaba': 'om-gaba',
      'guims-educ': 'om-guims-educ',
      'guims-academy': 'om-guims-academy',
      'digitboosterplus': 'om-digitboosterplus',
    } as const;
    return mapped[departmentId] ?? method;
  }
  return method;
};

export const getPaymentMethodLabel = (method: PaymentMethod, departmentId?: DepartmentId): string => {
  const normalized = normalizePaymentMethod(method, departmentId);
  return getAllPaymentMethods().find(m => m.value === normalized)?.label ?? normalized;
};

export interface Transaction {
  id: string;
  departmentId: DepartmentId;
  type: 'income' | 'expense';
  incomeNature?: IncomeNature;
  paymentMethod: PaymentMethod;
  category: string;
  personName: string;       // Nom de la personne (client, fournisseur, formé, etc.)
  phoneNumber?: string;     // Numéro de téléphone
  description: string;
  amount: number;
  date: string;
  createdAt: string;
  saleTicketNumber?: string; // Ticket de vente lié à la sortie de stock auto
  quantity?: number;
  stockItemId?: string;
  // Champs spécifiques formations
  enrollmentDate?: string;  // Date d'inscription (auto)
  tranche?: string;         // Numéro de tranche (Guims Academy)
  formationName?: string;   // Nom de la formation choisie
  desiredTrainingDate?: string; // Date souhaitée de la formation
  formationKit?: string[];  // Éléments du kit (starter kit, livre, etc.)
}

export const departments: Department[] = [
  {
    id: 'gaba',
    name: 'GABA',
    description: 'Produits d\'élevage, intrants, géniteurs, formations',
    logo: logoGaba,
    colorClass: 'dept-gaba',
    bgClass: 'bg-dept-gaba',
    bgLightClass: 'bg-dept-gaba-light',
    incomeCategories: ['Vente intrants', 'Vente géniteurs', 'Inscriptions formation', 'Frais de formation', 'Apport externe', 'Autres revenus'],
    expenseCategories: ['Achat composants intrants', 'Achat géniteurs', 'Frais de transport', 'Frais divers'],
  },
  {
    id: 'guims-educ',
    name: 'Guims Educ',
    description: 'Cours de répétition, prépas concours, coaching scolaire',
    logo: logoGuimsEduc,
    colorClass: 'dept-guims-educ',
    bgClass: 'bg-dept-guims-educ',
    bgLightClass: 'bg-dept-guims-educ-light',
    incomeCategories: ['Inscription élève/étudiant', 'Mensualité parent', 'Frais de cours à domicile', 'Frais cours en ligne', 'Prépas concours', 'Coaching scolaire', 'Apport externe', 'Autres formations'],
    expenseCategories: ['Communication Facebook', 'Frais de déplacement', 'Matériel pédagogique', 'Autres dépenses'],
  },
  {
    id: 'guims-academy',
    name: 'Guims Academy',
    description: 'Formations professionnelles multidisciplinaires',
    logo: logoGuimsAcademy,
    colorClass: 'dept-guims-academy',
    bgClass: 'bg-dept-guims-academy',
    bgLightClass: 'bg-dept-guims-academy-light',
    incomeCategories: ['Inscription étudiant', 'Frais de formation - Tranche 1', 'Frais de formation - Tranche 2', 'Frais de formation - Tranche 3', 'Frais de formation - Complet', 'Apport externe'],
    expenseCategories: ['Matériel de formation', 'Location salle', 'Rémunération formateur', 'Autres dépenses'],
  },
  {
    id: 'digitboosterplus',
    name: 'DigitBoosterPlus',
    description: 'Création de sites web, publication Facebook, boosts',
    logo: logoDigitbooster,
    colorClass: 'dept-digitbooster',
    bgClass: 'bg-dept-digitbooster',
    bgLightClass: 'bg-dept-digitbooster-light',
    incomeCategories: ['Création site web', 'Boost Facebook', 'Publication Facebook', 'Community management', 'Apport externe', 'Autres services digitaux'],
    expenseCategories: ['Hébergement', 'Outils digitaux', 'Publicité', 'Autres dépenses'],
  },
  {
    id: 'charges-entreprise',
    name: 'Direction Générale',
    description: 'Charges communes, coordination générale, salaires et frais généraux de l\'entreprise',
    logo: logoGuimsGroup,
    colorClass: 'dept-charges-entreprise',
    bgClass: 'bg-dept-charges-entreprise',
    bgLightClass: 'bg-dept-charges-entreprise-light',
    incomeCategories: ['Apport de trésorerie', 'Apport externe', 'Remboursement de charges', 'Autres revenus'],
    expenseCategories: ['Paiement employés', 'Connexion internet', 'Loyer et charges locatives', 'Transport et missions', 'Impôts et taxes', 'Fournitures et services', 'Autres dépenses'],
  },
];

export const STOCK_ENABLED_DEPARTMENT_IDS: DepartmentId[] = ['gaba', 'guims-educ', 'guims-academy', 'digitboosterplus'];

export const getDepartment = (id: DepartmentId) => departments.find(d => d.id === id)!;

// LocalStorage-based data management
const STORAGE_KEY = 'finance-transactions';

const EXTERNAL_INCOME_CATEGORY_MARKERS = [
  'apport externe',
  'apport de tresorerie',
  'apport de trésorerie',
  'don',
  'subvention',
  'financement externe',
  'injection',
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isExternalContributionCategory(category: string): boolean {
  const normalized = normalizeText(category || '');
  return EXTERNAL_INCOME_CATEGORY_MARKERS.some(marker => normalized.includes(normalizeText(marker)));
}

const FORMATION_REVENUE_MARKERS = [
  'formation',
  'inscription',
  'cours',
  'coaching',
  'prepa',
  'prépa',
  'concours',
];

export function isFormationRevenueCategory(category: string): boolean {
  const normalized = normalizeText(category || '');
  return FORMATION_REVENUE_MARKERS.some(marker => normalized.includes(normalizeText(marker)));
}

export function isStockSaleTransaction(tx: Pick<Transaction, 'type' | 'category' | 'stockItemId' | 'saleTicketNumber'>): boolean {
  if (tx.type !== 'income') return false;
  if (tx.stockItemId || tx.saleTicketNumber) return true;
  const normalized = normalizeText(tx.category || '');
  return normalized.includes('vente');
}

function normalizeIncomeNature(tx: Partial<Transaction>): Transaction['incomeNature'] {
  if (tx.type !== 'income') return undefined;
  if (tx.incomeNature === 'external-contribution' || tx.incomeNature === 'operational') {
    return tx.incomeNature;
  }
  return isExternalContributionCategory(String(tx.category || ''))
    ? 'external-contribution'
    : 'operational';
}

function normalizeStoredTransaction(tx: any): Transaction {
  const normalizedCreatedAt = normalizeTransactionDate(tx?.createdAt || tx?.date || '');
  const normalizedDate = normalizeTransactionDate(tx?.date || '', new Date(normalizedCreatedAt));
  const hasEnrollmentDate = typeof tx?.enrollmentDate === 'string';
  const normalizedEnrollmentDate = hasEnrollmentDate
    ? normalizeTransactionDate(tx.enrollmentDate, new Date(normalizedDate))
    : undefined;

  const changed =
    tx?.createdAt !== normalizedCreatedAt ||
    tx?.date !== normalizedDate ||
    (hasEnrollmentDate && tx?.enrollmentDate !== normalizedEnrollmentDate);

  const normalizedIncomeNature = normalizeIncomeNature(tx as Partial<Transaction>);
  const incomeNatureChanged = tx?.incomeNature !== normalizedIncomeNature;

  if (!changed && !incomeNatureChanged) return tx as Transaction;

  return {
    ...tx,
    createdAt: normalizedCreatedAt,
    date: normalizedDate,
    incomeNature: normalizedIncomeNature,
    ...(hasEnrollmentDate ? { enrollmentDate: normalizedEnrollmentDate } : {}),
  } as Transaction;
}

export const getTransactions = (): Transaction[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];

  const parsed = JSON.parse(data);
  if (!Array.isArray(parsed)) return [];

  const normalized = parsed.map(normalizeStoredTransaction);
  const changed = normalized.some((tx, i) => tx !== parsed[i]);
  if (changed) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
};

export const addTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>): Transaction => {
  const transactions = getTransactions();
  const now = new Date();
  const newTx: Transaction = {
    ...tx,
    incomeNature: normalizeIncomeNature(tx),
    date: normalizeTransactionDate(tx.date, now),
    ...(tx.enrollmentDate ? { enrollmentDate: normalizeTransactionDate(tx.enrollmentDate, now) } : {}),
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
  };
  transactions.push(newTx);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  syncSetDoc(TABLES.transactions, newTx);
  return newTx;
};

export const updateTransaction = (id: string, updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>): Transaction | null => {
  const transactions = getTransactions();
  const index = transactions.findIndex(t => t.id === id);
  if (index === -1) return null;

  const normalizedUpdates = { ...updates };
  if (typeof normalizedUpdates.date === 'string') {
    normalizedUpdates.date = normalizeTransactionDate(normalizedUpdates.date, new Date(transactions[index].createdAt));
  }
  if (typeof normalizedUpdates.enrollmentDate === 'string') {
    normalizedUpdates.enrollmentDate = normalizeTransactionDate(normalizedUpdates.enrollmentDate, new Date(transactions[index].createdAt));
  }

  transactions[index] = {
    ...transactions[index],
    ...normalizedUpdates,
    incomeNature: normalizeIncomeNature({ ...transactions[index], ...normalizedUpdates }),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  syncSetDoc(TABLES.transactions, transactions[index]);
  return transactions[index];
};

export const deleteTransaction = (id: string) => {
  const tx = getTransactions().find(t => t.id === id);
  const transactions = getTransactions().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  // Supprimer de Supabase directement
  syncDeleteDoc(TABLES.transactions, id);
  return tx;
};

export const exportTransactionsCSV = (): string => {
  const txs = getTransactions();
  const headers = ['Date/Heure', 'Département', 'Type', 'Origine entrée', 'Caisse', 'Nom', 'Téléphone', 'Catégorie', 'Description', 'Montant (FCFA)'];
  const rows = txs
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(tx => {
      const dept = getDepartment(tx.departmentId);
      return [
        new Date(tx.date).toLocaleString('fr-FR'),
        dept.name,
        tx.type === 'income' ? 'Revenu' : 'Dépense',
        tx.type === 'income'
          ? (tx.incomeNature === 'external-contribution' ? 'Apport externe' : 'Activité opérationnelle')
          : '',
        getPaymentMethodLabel(tx.paymentMethod || 'especes', tx.departmentId),
        `"${(tx.personName || '').replace(/"/g, '""')}"`,
        `"${(tx.phoneNumber || '').replace(/"/g, '""')}"`,
        tx.category,
        `"${tx.description.replace(/"/g, '""')}"`,
        tx.type === 'income' ? tx.amount : -tx.amount,
      ].join(';');
    });
  return [headers.join(';'), ...rows].join('\n');
};

export const exportDataJSON = (): string => {
  return JSON.stringify({ transactions: getTransactions(), exportedAt: new Date().toISOString() }, null, 2);
};

export const importDataJSON = (json: string): { success: boolean; count: number; error?: string } => {
  try {
    const data = JSON.parse(json);
    if (!data.transactions || !Array.isArray(data.transactions)) {
      return { success: false, count: 0, error: 'Format invalide: tableau "transactions" manquant' };
    }
    for (const tx of data.transactions) {
      if (!tx.id || !tx.departmentId || !tx.type || !tx.amount || !tx.date) {
        return { success: false, count: 0, error: 'Format invalide: transaction incomplète' };
      }
    }
    const normalizedTransactions = data.transactions.map((tx: any) => normalizeStoredTransaction(tx));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedTransactions));
    // Bulk import → full push to sync everything to Supabase
    pushAllToSupabase().catch(err => console.error('[Import] Sync error:', err));
    return { success: true, count: normalizedTransactions.length };
  } catch {
    return { success: false, count: 0, error: 'JSON invalide' };
  }
};

export const getTransactionsByDepartment = (deptId: DepartmentId) => {
  return getTransactions().filter(t => t.departmentId === deptId);
};

export const getDepartmentStats = (deptId: DepartmentId) => {
  const txs = getTransactionsByDepartment(deptId);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const externalIncome = txs
    .filter(t => t.type === 'income' && t.incomeNature === 'external-contribution')
    .reduce((s, t) => s + t.amount, 0);
  const operationalIncome = income - externalIncome;
  const externalIncomeCount = txs.filter(t => t.type === 'income' && t.incomeNature === 'external-contribution').length;
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, operationalIncome, externalIncome, externalIncomeCount, expenses, balance: income - expenses, count: txs.length };
};

export const getGlobalStats = () => {
  const txs = getTransactions();
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const externalIncome = txs
    .filter(t => t.type === 'income' && t.incomeNature === 'external-contribution')
    .reduce((s, t) => s + t.amount, 0);
  const operationalIncome = income - externalIncome;
  const externalIncomeCount = txs.filter(t => t.type === 'income' && t.incomeNature === 'external-contribution').length;
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, operationalIncome, externalIncome, externalIncomeCount, expenses, balance: income - expenses, count: txs.length };
};

export const getTransactionsByMonth = (year: number, month: number) => {
  return getTransactions().filter(tx => {
    const d = new Date(getTransactionTimestamp(tx.date));
    return d.getFullYear() === year && d.getMonth() === month;
  });
};

export const getMonthlyStats = (year: number, month: number) => {
  const txs = getTransactionsByMonth(year, month);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const externalIncome = txs
    .filter(t => t.type === 'income' && t.incomeNature === 'external-contribution')
    .reduce((s, t) => s + t.amount, 0);
  const operationalIncome = income - externalIncome;
  const externalIncomeCount = txs.filter(t => t.type === 'income' && t.incomeNature === 'external-contribution').length;
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, operationalIncome, externalIncome, externalIncomeCount, expenses, balance: income - expenses, count: txs.length };
};

/** Returns % change: positive = improvement, negative = decrease. null if no previous data. */
export const computeTrend = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
};

export const getStatsByPaymentMethod = (txs?: Transaction[]) => {
  const all = txs ?? getTransactions();
  const grouped = new Map<PaymentMethod, { income: number; expenses: number; count: number; departmentId?: DepartmentId }>();

  for (const tx of all) {
    const method = normalizePaymentMethod(tx.paymentMethod || 'especes', tx.departmentId);
    const current = grouped.get(method) || { income: 0, expenses: 0, count: 0, departmentId: tx.departmentId };
    if (tx.type === 'income') current.income += tx.amount;
    else current.expenses += tx.amount;
    current.count += 1;
    grouped.set(method, current);
  }

  return [...grouped.entries()]
    .map(([method, value]) => ({
      method,
      label: getPaymentMethodLabel(method, value.departmentId),
      income: value.income,
      expenses: value.expenses,
      balance: value.income - value.expenses,
      count: value.count,
    }))
    .sort((a, b) => b.count - a.count);
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(amount);
};

// Catégories qui nécessitent un nom de personne
export const ENROLLMENT_CATEGORIES = [
  'Inscriptions formation', 'Frais de formation',
  'Inscription élève/étudiant', 'Mensualité parent', 'Frais de cours à domicile', 'Frais cours en ligne', 'Prépas concours', 'Coaching scolaire', 'Autres formations',
  'Inscription étudiant', 'Frais de formation - Tranche 1', 'Frais de formation - Tranche 2', 'Frais de formation - Tranche 3', 'Frais de formation - Complet',
];

export const isEnrollmentCategory = (category: string): boolean =>
  ENROLLMENT_CATEGORIES.includes(category);

export const isTranche = (category: string): boolean =>
  category.startsWith('Frais de formation - Tranche');

/** Categories that are inscription fees (separate from formation tuition) */
export const isInscriptionCategory = (category: string): boolean =>
  ['Inscription étudiant', 'Inscription élève/étudiant', 'Inscriptions formation'].includes(category);
