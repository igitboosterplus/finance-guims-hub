import logoGaba from '@/assets/logo-gaba.png';
import logoGuimsEduc from '@/assets/logo-guims-educ.jpg';
import logoGuimsAcademy from '@/assets/logo-guims-academy.jpg';
import logoDigitbooster from '@/assets/logo-digitbooster.png';
import logoGuimsGroup from '@/assets/logo-guims-group.jpg';
import { syncSetDoc, syncDeleteDoc, pushAllToSupabase } from './sync';
import { TABLES } from './firebase';

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

export type PaymentMethod =
  | 'especes'
  | 'banque'
  | 'momo'
  | 'om'
  | 'momo-gaba'
  | 'om-gaba'
  | 'momo-guims-educ'
  | 'om-guims-educ'
  | 'momo-guims-academy'
  | 'om-guims-academy'
  | 'momo-digitboosterplus'
  | 'om-digitboosterplus';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'especes', label: 'Espèces' },
  { value: 'banque', label: 'Banque' },
  { value: 'momo', label: 'MoMo (ancien non affecté)' },
  { value: 'om', label: 'OM (ancien non affecté)' },
  { value: 'momo-gaba', label: 'MoMo GABA' },
  { value: 'om-gaba', label: 'OM GABA' },
  { value: 'momo-guims-educ', label: 'MoMo Guims Educ' },
  { value: 'om-guims-educ', label: 'OM Guims Educ' },
  { value: 'momo-guims-academy', label: 'MoMo Guims Academy' },
  { value: 'om-guims-academy', label: 'OM Guims Academy' },
  { value: 'momo-digitboosterplus', label: 'MoMo DigitBoosterPlus' },
  { value: 'om-digitboosterplus', label: 'OM DigitBoosterPlus' },
];

const DEPARTMENT_PAYMENT_METHODS: Record<DepartmentId, PaymentMethod[]> = {
  'gaba': ['especes', 'banque', 'momo-gaba', 'om-gaba'],
  'guims-educ': ['especes', 'banque', 'momo-guims-educ', 'om-guims-educ'],
  'guims-academy': ['especes', 'banque', 'momo-guims-academy', 'om-guims-academy'],
  'digitboosterplus': ['especes', 'banque', 'momo-digitboosterplus', 'om-digitboosterplus'],
  'charges-entreprise': [
    'especes',
    'banque',
    'momo-gaba',
    'om-gaba',
    'momo-guims-educ',
    'om-guims-educ',
    'momo-guims-academy',
    'om-guims-academy',
    'momo-digitboosterplus',
    'om-digitboosterplus',
  ],
};

export const getPaymentMethodsForDepartment = (departmentId?: DepartmentId): { value: PaymentMethod; label: string }[] => {
  const methods = departmentId ? DEPARTMENT_PAYMENT_METHODS[departmentId] : ['especes', 'banque', 'momo', 'om'];
  return methods.map(method => ({ value: method, label: getPaymentMethodLabel(method, departmentId) }));
};

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
  return PAYMENT_METHODS.find(m => m.value === normalized)?.label ?? normalized;
};

export interface Transaction {
  id: string;
  departmentId: DepartmentId;
  type: 'income' | 'expense';
  paymentMethod: PaymentMethod;
  category: string;
  personName: string;       // Nom de la personne (client, fournisseur, formé, etc.)
  phoneNumber?: string;     // Numéro de téléphone
  description: string;
  amount: number;
  date: string;
  createdAt: string;
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
    incomeCategories: ['Vente intrants', 'Vente géniteurs', 'Inscriptions formation', 'Frais de formation', 'Autres revenus'],
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
    incomeCategories: ['Inscription élève/étudiant', 'Frais de cours à domicile', 'Frais cours en ligne', 'Prépas concours', 'Coaching scolaire', 'Autres formations'],
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
    incomeCategories: ['Inscription étudiant', 'Frais de formation - Tranche 1', 'Frais de formation - Tranche 2', 'Frais de formation - Tranche 3', 'Frais de formation - Complet'],
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
    incomeCategories: ['Création site web', 'Boost Facebook', 'Publication Facebook', 'Community management', 'Autres services digitaux'],
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
    incomeCategories: ['Apport de trésorerie', 'Remboursement de charges', 'Autres revenus'],
    expenseCategories: ['Paiement employés', 'Connexion internet', 'Loyer et charges locatives', 'Transport et missions', 'Impôts et taxes', 'Fournitures et services', 'Autres dépenses'],
  },
];

export const STOCK_ENABLED_DEPARTMENT_IDS: DepartmentId[] = ['gaba', 'guims-educ', 'guims-academy', 'digitboosterplus'];

export const getDepartment = (id: DepartmentId) => departments.find(d => d.id === id)!;

// LocalStorage-based data management
const STORAGE_KEY = 'finance-transactions';

export const getTransactions = (): Transaction[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const addTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>): Transaction => {
  const transactions = getTransactions();
  const newTx: Transaction = {
    ...tx,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
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
  transactions[index] = { ...transactions[index], ...updates };
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
  const headers = ['Date/Heure', 'Département', 'Type', 'Caisse', 'Nom', 'Téléphone', 'Catégorie', 'Description', 'Montant (FCFA)'];
  const rows = txs
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(tx => {
      const dept = getDepartment(tx.departmentId);
      return [
        new Date(tx.date).toLocaleString('fr-FR'),
        dept.name,
        tx.type === 'income' ? 'Revenu' : 'Dépense',
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.transactions));
    // Bulk import → full push to sync everything to Supabase
    pushAllToSupabase().catch(err => console.error('[Import] Sync error:', err));
    return { success: true, count: data.transactions.length };
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
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expenses, balance: income - expenses, count: txs.length };
};

export const getGlobalStats = () => {
  const txs = getTransactions();
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expenses, balance: income - expenses, count: txs.length };
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
  'Inscription élève/étudiant', 'Frais de cours à domicile', 'Frais cours en ligne', 'Prépas concours', 'Coaching scolaire', 'Autres formations',
  'Inscription étudiant', 'Frais de formation - Tranche 1', 'Frais de formation - Tranche 2', 'Frais de formation - Tranche 3', 'Frais de formation - Complet',
];

export const isEnrollmentCategory = (category: string): boolean =>
  ENROLLMENT_CATEGORIES.includes(category);

export const isTranche = (category: string): boolean =>
  category.startsWith('Frais de formation - Tranche');

/** Categories that are inscription fees (separate from formation tuition) */
export const isInscriptionCategory = (category: string): boolean =>
  ['Inscription étudiant', 'Inscription élève/étudiant', 'Inscriptions formation'].includes(category);
