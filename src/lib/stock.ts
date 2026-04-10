// ==================== GABA STOCK MANAGEMENT ====================

import { syncFullCollection } from './sync';
import { TABLES } from './firebase';

export interface StockCategory {
  id: string;
  name: string;
  description: string;
}

export const STOCK_CATEGORIES: StockCategory[] = [
  { id: 'geniteurs', name: 'Géniteurs', description: 'Animaux reproducteurs (poules, lapins, etc.)' },
  { id: 'intrants', name: 'Intrants', description: 'Aliments, médicaments, compléments' },
  { id: 'equipements', name: 'Équipements', description: 'Matériel d\'élevage et outils' },
  { id: 'produits-finis', name: 'Produits finis', description: 'Œufs, viande, fumier, etc.' },
];

export interface StockItem {
  id: string;
  categoryId: string;
  name: string;
  unit: string;        // pièce, kg, sac, litre, carton...
  currentQuantity: number;
  alertThreshold: number;
  purchasePrice: number;  // prix d'achat unitaire en FCFA
  sellingPrice: number;   // prix de vente unitaire en FCFA
  unitPrice?: number;     // legacy — kept for backward compat
  createdAt: string;
}

export type MovementType = 'entry' | 'exit' | 'adjustment' | 'training' | 'gift';

export interface StockMovement {
  id: string;
  itemId: string;
  type: MovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  unitPrice: number;
  reason: string;
  date: string;
  createdAt: string;
  createdBy: string;
  parkName?: string;       // Parc de formation (for training/gift)
  traineeName?: string;    // Nom du formé (for gift)
}

// ==================== TRAINING / FORMATION ====================

export type TrainingType = 'gaba' | 'guims-academy';

export interface TrainingMaterial {
  itemId: string;
  quantity: number;
}

export interface TrainingGift {
  traineeName: string;
  itemId: string;
  quantity: number;
}

export interface TraineeKit {
  traineeName: string;
  starterKitHannetons: number; // Nombre de hannetons du kit de démarrage
  hasBook: boolean;            // A-t-il droit à un livre ?
  otherItems: TrainingGift[];  // Autres éléments offerts
}

export interface Training {
  id: string;
  trainingType: TrainingType;  // GABA ou Guims Academy
  parkName: string;            // Parc de formation (GABA) ou lieu (Academy)
  date: string;
  enrollmentDate: string;      // Date d'inscription (automatique)
  description: string;
  trainees: string[];          // noms des formés
  traineeKits: TraineeKit[];   // kits par formé (GABA)
  materialsUsed: TrainingMaterial[];
  giftsGiven: TrainingGift[];
  // Guims Academy specifics
  tranche?: string;            // Tranche en cours (Tranche 1, 2, 3, Complet)
  createdAt: string;
  createdBy: string;
}

const STOCK_ITEMS_KEY = 'gaba-stock-items';
const STOCK_MOVEMENTS_KEY = 'gaba-stock-movements';
const TRAININGS_KEY = 'gaba-trainings';

// ==================== ITEMS ====================

export function getStockItems(): StockItem[] {
  const data = localStorage.getItem(STOCK_ITEMS_KEY);
  if (!data) return [];
  // Migrate legacy unitPrice → purchasePrice + sellingPrice
  const raw: any[] = JSON.parse(data);
  return raw.map(item => ({
    ...item,
    purchasePrice: item.purchasePrice ?? item.unitPrice ?? 0,
    sellingPrice: item.sellingPrice ?? item.unitPrice ?? 0,
  }));
}

function saveStockItems(items: StockItem[]) {
  localStorage.setItem(STOCK_ITEMS_KEY, JSON.stringify(items));
  syncFullCollection(TABLES.stockItems, STOCK_ITEMS_KEY);
}

export function addStockItem(item: Omit<StockItem, 'id' | 'createdAt' | 'currentQuantity' | 'unitPrice'>): StockItem {
  const items = getStockItems();
  const newItem: StockItem = {
    ...item,
    id: crypto.randomUUID(),
    currentQuantity: 0,
    createdAt: new Date().toISOString(),
  };
  items.push(newItem);
  saveStockItems(items);
  return newItem;
}

export function updateStockItem(id: string, updates: Partial<Pick<StockItem, 'name' | 'unit' | 'alertThreshold' | 'purchasePrice' | 'sellingPrice' | 'categoryId'>>): StockItem | null {
  const items = getStockItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates };
  saveStockItems(items);
  return items[idx];
}

export function deleteStockItem(id: string): boolean {
  const items = getStockItems();
  const filtered = items.filter(i => i.id !== id);
  if (filtered.length === items.length) return false;
  saveStockItems(filtered);
  // Also clean movements for that item
  const movements = getStockMovements().filter(m => m.itemId !== id);
  saveStockMovements(movements);
  return true;
}

// ==================== MOVEMENTS ====================

export function getStockMovements(): StockMovement[] {
  const data = localStorage.getItem(STOCK_MOVEMENTS_KEY);
  return data ? JSON.parse(data) : [];
}

function saveStockMovements(movements: StockMovement[]) {
  localStorage.setItem(STOCK_MOVEMENTS_KEY, JSON.stringify(movements));
  syncFullCollection(TABLES.stockMovements, STOCK_MOVEMENTS_KEY);
}

export function addStockMovement(
  itemId: string,
  type: MovementType,
  quantity: number,
  unitPrice: number,
  reason: string,
  date: string,
  createdBy: string,
  parkName?: string,
  traineeName?: string,
): { success: boolean; movement?: StockMovement; error?: string } {
  const items = getStockItems();
  const idx = items.findIndex(i => i.id === itemId);
  if (idx === -1) return { success: false, error: 'Article introuvable' };

  const item = items[idx];
  const previousQuantity = item.currentQuantity;
  let newQuantity: number;

  if (type === 'entry') {
    newQuantity = previousQuantity + quantity;
  } else if (type === 'exit' || type === 'training' || type === 'gift') {
    if (quantity > previousQuantity) {
      return { success: false, error: `Stock insuffisant (${previousQuantity} ${item.unit} disponible${previousQuantity > 1 ? 's' : ''})` };
    }
    newQuantity = previousQuantity - quantity;
  } else {
    // adjustment: quantity is the new absolute value
    newQuantity = quantity;
  }

  // Update item quantity
  items[idx].currentQuantity = newQuantity;
  if (type === 'entry' && unitPrice > 0) items[idx].purchasePrice = unitPrice;
  if (type === 'exit' && unitPrice > 0) items[idx].sellingPrice = unitPrice;
  saveStockItems(items);

  // Record movement
  const movements = getStockMovements();
  const movement: StockMovement = {
    id: crypto.randomUUID(),
    itemId,
    type,
    quantity,
    previousQuantity,
    newQuantity,
    unitPrice: (type === 'training' || type === 'gift') ? 0 : unitPrice,
    reason,
    date,
    createdAt: new Date().toISOString(),
    createdBy,
    ...(parkName ? { parkName } : {}),
    ...(traineeName ? { traineeName } : {}),
  };
  movements.push(movement);
  saveStockMovements(movements);

  return { success: true, movement };
}

// ==================== QUERIES ====================

export function getItemMovements(itemId: string): StockMovement[] {
  return getStockMovements().filter(m => m.itemId === itemId);
}

export function getStockByCategory(categoryId: string): StockItem[] {
  return getStockItems().filter(i => i.categoryId === categoryId);
}

export function getLowStockItems(): StockItem[] {
  return getStockItems().filter(i => i.currentQuantity <= i.alertThreshold);
}

export function getStockStats() {
  const items = getStockItems();
  const totalItems = items.length;
  const lowStock = items.filter(i => i.currentQuantity <= i.alertThreshold).length;
  const totalValue = items.reduce((sum, i) => sum + i.currentQuantity * i.sellingPrice, 0);
  const movements = getStockMovements();
  const totalMovements = movements.length;
  return { totalItems, lowStock, totalValue, totalMovements };
}

export function getCategoryLabel(categoryId: string): string {
  return STOCK_CATEGORIES.find(c => c.id === categoryId)?.name ?? categoryId;
}

// ==================== EXPORT ====================

export function exportStockCSV(): string {
  const items = getStockItems();
  const headers = ['Catégorie', 'Article', 'Unité', 'Quantité', 'Seuil alerte', 'Prix achat (FCFA)', 'Prix vente (FCFA)', 'Valeur stock (FCFA)'];
  const rows = items
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
    .map(item => [
      getCategoryLabel(item.categoryId),
      `"${item.name.replace(/"/g, '""')}"`,
      item.unit,
      item.currentQuantity,
      item.alertThreshold,
      item.purchasePrice,
      item.sellingPrice,
      item.currentQuantity * item.sellingPrice,
    ].join(';'));
  return [headers.join(';'), ...rows].join('\n');
}

// ==================== TRAININGS / FORMATIONS ====================

export function getTrainings(): Training[] {
  const data = localStorage.getItem(TRAININGS_KEY);
  return data ? JSON.parse(data) : [];
}

function saveTrainings(trainings: Training[]) {
  localStorage.setItem(TRAININGS_KEY, JSON.stringify(trainings));
  syncFullCollection(TABLES.trainings, TRAININGS_KEY);
}

export function addTraining(training: Omit<Training, 'id' | 'createdAt' | 'enrollmentDate'>): Training {
  const trainings = getTrainings();
  const newTraining: Training = {
    ...training,
    id: crypto.randomUUID(),
    enrollmentDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  trainings.push(newTraining);
  saveTrainings(trainings);
  return newTraining;
}

export function deleteTraining(id: string): boolean {
  const trainings = getTrainings();
  const filtered = trainings.filter(t => t.id !== id);
  if (filtered.length === trainings.length) return false;
  saveTrainings(filtered);
  return true;
}

export function getMovementTypeLabel(type: MovementType): string {
  switch (type) {
    case 'entry': return 'Entrée';
    case 'exit': return 'Sortie';
    case 'adjustment': return 'Ajustement';
    case 'training': return 'Formation (usage)';
    case 'gift': return 'Don formé';
    default: return type;
  }
}

// ==================== FORMATION CATALOG (formations + packs) ====================

import type { DepartmentId } from './data';

/** An item included in a pack, linked to stock for synchronization */
export interface PackKitItem {
  stockItemId: string;      // ID of the stock item (or '' if free-text only)
  label: string;            // Display label (e.g. "Kit de démarrage hannetons")
  quantity: number;         // Quantity included in the pack
  specialPrice?: number;    // Prix spécial (FCFA), undefined = gratuit dans le pack
  normalPrice?: number;     // Prix normal hors pack (pour afficher la réduction)
}

/** An advantage/benefit described in text (non-stock) */
export interface PackAdvantage {
  description: string;
}

/** A pack/tier within a formation */
export interface FormationPack {
  id: string;
  name: string;             // e.g. "Pack Universel", "Pack Classique", "Pack Gold"
  price: number;            // Prix du pack en FCFA
  advantages: PackAdvantage[];
  kitItems: PackKitItem[];
}

/** A tranche (installment) with deadline for tranche-based formations */
export interface FormationTranche {
  id: string;
  name: string;             // e.g. "Tranche 1", "Tranche 2", "Tranche 3"
  amount: number;           // Montant de la tranche en FCFA
  deadline: string;         // Date limite (ISO string or YYYY-MM-DD)
}

/** A formation (training program) — supports pack mode or tranche mode */
export interface FormationCatalog {
  id: string;
  departmentId: DepartmentId;
  name: string;             // e.g. "Formation Hanneton"
  description: string;
  /** 'packs' = tiered packs (GABA, etc.), 'tranches' = installments with deadlines (Guims Academy) */
  mode: 'packs' | 'tranches';
  packs: FormationPack[];
  /** Tranche mode fields */
  tranches?: FormationTranche[];
  totalPrice?: number;      // Prix total de la formation (paiement complet)
  inscriptionFee?: number;  // Frais d'inscription (hors prix de formation)
  createdAt: string;
  createdBy: string;
}

const FORMATIONS_CATALOG_KEY = 'formations-catalog';

export function getFormationsCatalog(): FormationCatalog[] {
  const data = localStorage.getItem(FORMATIONS_CATALOG_KEY);
  return data ? JSON.parse(data) : [];
}

function saveFormationsCatalog(formations: FormationCatalog[]) {
  localStorage.setItem(FORMATIONS_CATALOG_KEY, JSON.stringify(formations));
  syncFullCollection(TABLES.formationsCatalog, FORMATIONS_CATALOG_KEY);
}

export function addFormationCatalog(formation: Omit<FormationCatalog, 'id' | 'createdAt'>): FormationCatalog {
  const formations = getFormationsCatalog();
  const newFormation: FormationCatalog = {
    ...formation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  formations.push(newFormation);
  saveFormationsCatalog(formations);
  return newFormation;
}

export function updateFormationCatalog(id: string, updates: Partial<Omit<FormationCatalog, 'id' | 'createdAt' | 'createdBy'>>): FormationCatalog | null {
  const formations = getFormationsCatalog();
  const idx = formations.findIndex(f => f.id === id);
  if (idx === -1) return null;
  formations[idx] = { ...formations[idx], ...updates };
  saveFormationsCatalog(formations);
  return formations[idx];
}

export function deleteFormationCatalog(id: string): boolean {
  const formations = getFormationsCatalog();
  const filtered = formations.filter(f => f.id !== id);
  if (filtered.length === formations.length) return false;
  saveFormationsCatalog(filtered);
  return true;
}

export function getFormationsByDepartment(departmentId: DepartmentId): FormationCatalog[] {
  return getFormationsCatalog().filter(f => f.departmentId === departmentId);
}

// ==================== PAYMENT PLANS (Suivi des paiements en tranches/avances) ====================

/** An individual installment/payment recorded against a plan */
export interface PaymentInstallment {
  id: string;
  amount: number;           // Montant payé
  date: string;             // Date du paiement (YYYY-MM-DD)
  paymentMethod: string;    // 'especes' | 'momo' | 'om' | 'banque'
  transactionId?: string;   // ID de la transaction liée (si créée)
  note?: string;            // Note libre
  recordedBy: string;       // Qui a enregistré
  recordedAt: string;       // Quand (ISO string)
}

/** A scheduled tranche with a deadline date */
export interface ScheduledTranche {
  id: string;
  name: string;             // e.g. "Tranche 1", "Tranche 2"
  amount: number;           // Montant attendu
  dueDate: string;          // Date limite (YYYY-MM-DD)
}

/** A payment plan for tracking installments/advances */
export interface PaymentPlan {
  id: string;
  departmentId: DepartmentId;
  clientName: string;       // Nom du client
  /** Type: 'formation' pour une formation, 'service' pour un service (DigitBoosterPlus, etc.) */
  planType: 'formation' | 'service';
  /** Libellé du service/formation */
  label: string;            // Ex: "Formation Hanneton — Pack Gold", "Création site web Restaurant Chez Jo"
  description?: string;
  totalAmount: number;      // Montant total à payer
  installments: PaymentInstallment[];
  /** Tranches prévues avec dates limites */
  scheduledTranches?: ScheduledTranche[];
  status: 'en_cours' | 'termine' | 'annule' | 'archive';
  createdAt: string;
  createdBy: string;
  formationId?: string;     // Lien optionnel vers FormationCatalog
  packId?: string;          // Lien optionnel vers un pack
  inscriptionFee?: number;  // Frais d'inscription (hors formation)
  inscriptionPaid?: boolean; // Inscription déjà payée ?
}

const PAYMENT_PLANS_KEY = 'payment-plans';

/** Migration: move inscription installments out of plan.installments
 *  into the separate inscriptionPaid/inscriptionFee fields.
 *  Safe to run multiple times — always removes orphan inscription installments. */
export function migrateInscriptionInstallments(): void {
  const INSCRIPTION_NOTES = ['inscription étudiant', 'inscription élève/étudiant', 'inscriptions formation'];
  const plans = getPaymentPlans();
  let changed = false;
  for (const plan of plans) {
    // Always check for orphaned inscription installments (even if inscriptionPaid=true)
    const inscIdx = plan.installments.findIndex(i =>
      i.note && INSCRIPTION_NOTES.includes(i.note.toLowerCase())
    );
    if (inscIdx !== -1) {
      const inscInst = plan.installments[inscIdx];
      if (!plan.inscriptionPaid) {
        plan.inscriptionFee = inscInst.amount;
        plan.inscriptionPaid = true;
      }
      plan.installments.splice(inscIdx, 1);
      // Recalculate status
      const totalPaid = plan.installments.reduce((s, i) => s + i.amount, 0);
      plan.status = totalPaid >= plan.totalAmount ? 'termine' : 'en_cours';
      changed = true;
    }
  }
  if (changed) {
    savePaymentPlans(plans);
    console.log('[Migration] Inscription installments migrated to inscriptionPaid/inscriptionFee');
  }
}

/** Migration: remove orphaned installments that have no matching transaction.
 *  This cleans up data left by previous sync bugs (e.g. tranche→inscription edit
 *  that marked inscription paid but didn't remove the old installment). */
export function cleanupOrphanedInstallments(): void {
  // Read transactions directly from localStorage to avoid circular import
  const txRaw = localStorage.getItem('finance-transactions');
  const transactions: { personName: string; date: string; amount: number; category: string; type: string }[] = txRaw ? JSON.parse(txRaw) : [];
  const plans = getPaymentPlans();
  // Build a set of (personName.lower, date, amount) from income transactions
  const txSet = new Set<string>();
  for (const tx of transactions) {
    if (tx.type === 'income' && tx.personName) {
      txSet.add(`${tx.personName.toLowerCase()}|${tx.date}|${tx.amount}`);
    }
  }
  let changed = false;
  for (const plan of plans) {
    const clientLower = plan.clientName.toLowerCase();
    // Check each installment — does a matching transaction exist?
    const toRemove: number[] = [];
    for (let i = 0; i < plan.installments.length; i++) {
      const inst = plan.installments[i];
      const key = `${clientLower}|${inst.date}|${inst.amount}`;
      if (!txSet.has(key)) {
        // No matching transaction — this installment is orphaned
        console.log(`[Cleanup] Orphaned installment: ${plan.clientName}, ${inst.date}, ${inst.amount} — removing`);
        toRemove.push(i);
      }
    }
    if (toRemove.length > 0) {
      // Remove from end to start to preserve indices
      for (let k = toRemove.length - 1; k >= 0; k--) {
        plan.installments.splice(toRemove[k], 1);
      }
      const totalPaid = plan.installments.reduce((s, i) => s + i.amount, 0);
      plan.status = totalPaid >= plan.totalAmount ? 'termine' : 'en_cours';
      changed = true;
    }
  }
  if (changed) {
    savePaymentPlans(plans);
    console.log('[Cleanup] Orphaned installments removed');
  }
}

export function getPaymentPlans(): PaymentPlan[] {
  const data = localStorage.getItem(PAYMENT_PLANS_KEY);
  return data ? JSON.parse(data) : [];
}

function savePaymentPlans(plans: PaymentPlan[]) {
  localStorage.setItem(PAYMENT_PLANS_KEY, JSON.stringify(plans));
  syncFullCollection(TABLES.paymentPlans, PAYMENT_PLANS_KEY);
}

export function addPaymentPlan(plan: Omit<PaymentPlan, 'id' | 'createdAt' | 'installments' | 'status'>): PaymentPlan {
  const plans = getPaymentPlans();
  const newPlan: PaymentPlan = {
    ...plan,
    id: crypto.randomUUID(),
    installments: [],
    status: 'en_cours',
    createdAt: new Date().toISOString(),
  };
  plans.push(newPlan);
  savePaymentPlans(plans);
  return newPlan;
}

export function addInstallment(planId: string, installment: Omit<PaymentInstallment, 'id' | 'recordedAt'>): PaymentPlan | null {
  const plans = getPaymentPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return null;
  plan.installments.push({
    ...installment,
    id: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
  });
  // Auto-complete if fully paid
  const totalPaid = plan.installments.reduce((s, i) => s + i.amount, 0);
  if (totalPaid >= plan.totalAmount) {
    plan.status = 'termine';
  }
  savePaymentPlans(plans);
  return plan;
}

export function updatePaymentPlanStatus(planId: string, status: PaymentPlan['status']): PaymentPlan | null {
  const plans = getPaymentPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return null;
  plan.status = status;
  savePaymentPlans(plans);
  return plan;
}

export function deletePaymentPlan(planId: string): boolean {
  const plans = getPaymentPlans();
  const filtered = plans.filter(p => p.id !== planId);
  if (filtered.length === plans.length) return false;
  savePaymentPlans(filtered);
  return true;
}

/** Mark inscription as paid (or update inscriptionFee) on a payment plan.
 *  Does NOT count as a formation installment — tracked separately. */
export function updatePlanInscription(planId: string, paid: boolean, fee?: number): PaymentPlan | null {
  const plans = getPaymentPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return null;
  plan.inscriptionPaid = paid;
  if (fee !== undefined) plan.inscriptionFee = fee;
  savePaymentPlans(plans);
  return plan;
}

/** Remove an installment (or reset inscription) from a payment plan when the linked transaction is deleted.
 *  Searches all plans for an installment matching the given personName, date, and amount.
 *  Also handles inscription payments (resets inscriptionPaid). */
export function removeInstallmentFromTransaction(personName: string, date: string, amount: number, category?: string): boolean {
  const INSCRIPTION_CATS = ['inscription étudiant', 'inscription élève/étudiant', 'inscriptions formation'];
  const isInscription = category && INSCRIPTION_CATS.includes(category.toLowerCase());
  const plans = getPaymentPlans();
  for (const plan of plans) {
    if (plan.clientName.toLowerCase() !== personName.toLowerCase()) continue;
    // If this was an inscription payment, reset the inscription flag
    if (isInscription && plan.inscriptionPaid) {
      plan.inscriptionPaid = false;
      savePaymentPlans(plans);
      return true;
    }
    // Otherwise look in installments
    const idx = plan.installments.findIndex(i => i.date === date && i.amount === amount);
    if (idx !== -1) {
      plan.installments.splice(idx, 1);
      // Re-check status
      const totalPaid = plan.installments.reduce((s, i) => s + i.amount, 0);
      plan.status = totalPaid >= plan.totalAmount ? 'termine' : 'en_cours';
      savePaymentPlans(plans);
      return true;
    }
  }
  return false;
}

/** Update an installment amount when the linked transaction is edited.
 *  Searches all plans for an installment matching the given personName, date, and oldAmount. */
export function syncInstallmentFromTransaction(personName: string, date: string, oldAmount: number, newAmount: number): boolean {
  const plans = getPaymentPlans();
  for (const plan of plans) {
    if (plan.clientName.toLowerCase() !== personName.toLowerCase()) continue;
    const inst = plan.installments.find(i => i.date === date && i.amount === oldAmount);
    if (inst) {
      inst.amount = newAmount;
      // Re-check auto-complete
      const totalPaid = plan.installments.reduce((s, i) => s + i.amount, 0);
      plan.status = totalPaid >= plan.totalAmount ? 'termine' : 'en_cours';
      savePaymentPlans(plans);
      return true;
    }
  }
  return false;
}

/** Full sync when editing a transaction: handles amount change, category change (tranche ↔ inscription), etc. */
export function syncEditedTransaction(
  personName: string,
  date: string,
  oldAmount: number,
  newAmount: number,
  oldCategory: string,
  newCategory: string,
): void {
  const INSCRIPTION_CATS = ['inscription étudiant', 'inscription élève/étudiant', 'inscriptions formation'];
  const wasInscription = INSCRIPTION_CATS.includes(oldCategory.toLowerCase());
  const isNowInscription = INSCRIPTION_CATS.includes(newCategory.toLowerCase());

  if (wasInscription === isNowInscription) {
    // Same type — just sync the amount if it changed
    if (wasInscription) {
      // Inscription → inscription: update fee if amount changed
      if (oldAmount !== newAmount) {
        const plans = getPaymentPlans();
        for (const plan of plans) {
          if (plan.clientName.toLowerCase() !== personName.toLowerCase()) continue;
          if (plan.inscriptionPaid) {
            plan.inscriptionFee = newAmount;
            savePaymentPlans(plans);
            return;
          }
        }
      }
    } else {
      // Tranche → tranche: sync installment amount
      if (oldAmount !== newAmount) {
        syncInstallmentFromTransaction(personName, date, oldAmount, newAmount);
      }
    }
    return;
  }

  // Category changed between inscription and tranche
  if (wasInscription && !isNowInscription) {
    // Was inscription, now tranche: reset inscription, add installment
    const plans = getPaymentPlans();
    for (const plan of plans) {
      if (plan.clientName.toLowerCase() !== personName.toLowerCase()) continue;
      if (plan.inscriptionPaid) {
        plan.inscriptionPaid = false;
        // Add as installment
        plan.installments.push({
          id: crypto.randomUUID(),
          amount: newAmount,
          date,
          paymentMethod: 'especes',
          recordedBy: 'sync',
          recordedAt: new Date().toISOString(),
        });
        const totalPaid = plan.installments.reduce((s, i) => s + i.amount, 0);
        plan.status = totalPaid >= plan.totalAmount ? 'termine' : 'en_cours';
        savePaymentPlans(plans);
        return;
      }
    }
  } else {
    // Was tranche, now inscription: remove installment, mark inscription paid
    const plans = getPaymentPlans();
    for (const plan of plans) {
      if (plan.clientName.toLowerCase() !== personName.toLowerCase()) continue;
      // Try to remove matching installment with multiple strategies
      let idx = plan.installments.findIndex(i => i.date === date && i.amount === oldAmount);
      if (idx === -1) idx = plan.installments.findIndex(i => i.date === date);
      if (idx === -1) idx = plan.installments.findIndex(i => i.amount === oldAmount);
      // Fallback: match by note containing oldCategory keyword (e.g. "Tranche 1")
      if (idx === -1) {
        const catLower = oldCategory.toLowerCase();
        idx = plan.installments.findIndex(i => i.note && catLower.includes(i.note.toLowerCase()));
        if (idx === -1) {
          idx = plan.installments.findIndex(i => i.note && i.note.toLowerCase().includes('tranche'));
        }
      }
      // Last resort: remove the last installment if there's at least one
      if (idx === -1 && plan.installments.length > 0) {
        idx = plan.installments.length - 1;
        console.log(`[syncEdit] Fallback: removing last installment #${idx} (${plan.installments[idx].amount} FCFA)`);
      }

      if (idx !== -1) {
        console.log(`[syncEdit] Removing installment: date=${plan.installments[idx].date}, amount=${plan.installments[idx].amount}, note=${plan.installments[idx].note}`);
        plan.installments.splice(idx, 1);
        const totalPaid = plan.installments.reduce((s, i) => s + i.amount, 0);
        plan.status = totalPaid >= plan.totalAmount ? 'termine' : 'en_cours';
      }
      // Mark inscription paid
      plan.inscriptionPaid = true;
      plan.inscriptionFee = newAmount;
      savePaymentPlans(plans);
      console.log(`[syncEdit] Plan updated: inscriptionPaid=true, fee=${newAmount}, installments=${plan.installments.length}`);
      return;
    }
  }
}

/** Get enrolled student names for a given formation (from existing payment plans) */
export function getEnrolledStudents(formationId: string): string[] {
  return getPaymentPlans()
    .filter(p => p.formationId === formationId)
    .map(p => p.clientName);
}

/** Describe how payments are allocated across scheduled tranches.
 *  Returns an array of { tranche, paid, remaining, status } for display purposes. */
export function getAllocationSummary(plan: PaymentPlan): { name: string; expected: number; paid: number; remaining: number; status: 'paid' | 'partial' | 'unpaid' }[] {
  if (!plan.scheduledTranches || plan.scheduledTranches.length === 0) return [];
  const totalPaid = getPaidAmount(plan);
  let allocated = 0;
  return plan.scheduledTranches.map(tr => {
    const end = allocated + tr.amount;
    const tranchePaid = Math.max(0, Math.min(tr.amount, totalPaid - allocated));
    allocated = end;
    return {
      name: tr.name,
      expected: tr.amount,
      paid: tranchePaid,
      remaining: tr.amount - tranchePaid,
      status: tranchePaid >= tr.amount ? 'paid' : tranchePaid > 0 ? 'partial' : 'unpaid',
    };
  });
}

/** Build a human-readable allocation message after a payment is made */
export function buildAllocationMessage(plan: PaymentPlan): string {
  const summary = getAllocationSummary(plan);
  if (summary.length === 0) return '';
  const parts: string[] = [];
  for (const s of summary) {
    if (s.status === 'paid') {
      parts.push(`${s.name}: payée ✓`);
    } else if (s.status === 'partial') {
      parts.push(`${s.name}: avance ${s.paid} / ${s.expected} FCFA`);
    }
  }
  return parts.join(' · ');
}

export function getPaymentPlansByDepartment(departmentId: DepartmentId): PaymentPlan[] {
  return getPaymentPlans().filter(p => p.departmentId === departmentId);
}

export function getPaidAmount(plan: PaymentPlan): number {
  return plan.installments.reduce((s, i) => s + i.amount, 0);
}

export function getRemainingAmount(plan: PaymentPlan): number {
  return Math.max(0, plan.totalAmount - getPaidAmount(plan));
}

// ==================== PAYMENT REMINDERS ====================

export interface PaymentReminder {
  planId: string;
  clientName: string;
  label: string;
  departmentId: DepartmentId;
  trancheName: string;
  trancheAmount: number;
  dueDate: string;
  /** 'today' = échéance aujourd'hui, 'tomorrow' = échéance dans 24h */
  urgency: 'today' | 'tomorrow';
}

/** Get all upcoming payment reminders (today + tomorrow) for active plans */
export function getPaymentReminders(referenceDate?: string): PaymentReminder[] {
  const plans = getPaymentPlans().filter(p => p.status === 'en_cours');
  const today = referenceDate ?? new Date().toISOString().split('T')[0];
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const tomorrowStr = new Date(todayMs + 86400000).toISOString().split('T')[0];

  const reminders: PaymentReminder[] = [];

  for (const plan of plans) {
    if (!plan.scheduledTranches?.length) continue;
    const paid = getPaidAmount(plan);
    // Walk through tranches in order — find unpaid ones
    let cumulative = 0;
    for (const tr of plan.scheduledTranches) {
      cumulative += tr.amount;
      if (paid >= cumulative) continue; // Already paid this tranche

      if (tr.dueDate === today) {
        reminders.push({
          planId: plan.id, clientName: plan.clientName, label: plan.label,
          departmentId: plan.departmentId, trancheName: tr.name,
          trancheAmount: tr.amount, dueDate: tr.dueDate, urgency: 'today',
        });
      } else if (tr.dueDate === tomorrowStr) {
        reminders.push({
          planId: plan.id, clientName: plan.clientName, label: plan.label,
          departmentId: plan.departmentId, trancheName: tr.name,
          trancheAmount: tr.amount, dueDate: tr.dueDate, urgency: 'tomorrow',
        });
      }
    }
  }

  return reminders.sort((a, b) => a.urgency === 'today' ? -1 : 1);
}

/** Get overdue scheduled tranches (past due date, not yet paid) */
export function getOverdueTranches(): PaymentReminder[] {
  const plans = getPaymentPlans().filter(p => p.status === 'en_cours');
  const today = new Date().toISOString().split('T')[0];
  const overdue: PaymentReminder[] = [];

  for (const plan of plans) {
    if (!plan.scheduledTranches?.length) continue;
    const paid = getPaidAmount(plan);
    let cumulative = 0;
    for (const tr of plan.scheduledTranches) {
      cumulative += tr.amount;
      if (paid >= cumulative) continue;
      if (tr.dueDate < today) {
        overdue.push({
          planId: plan.id, clientName: plan.clientName, label: plan.label,
          departmentId: plan.departmentId, trancheName: tr.name,
          trancheAmount: tr.amount, dueDate: tr.dueDate, urgency: 'today',
        });
      }
    }
  }
  return overdue;
}

// ==================== STOCK KITS (compositions) ====================

/** A component of a kit — references a stock item with a quantity */
export interface KitComponent {
  stockItemId: string;      // ID of the StockItem
  quantity: number;          // Quantity required per kit
}

/** A kit is a named composition of stock items */
export interface StockKit {
  id: string;
  name: string;             // e.g. "Kit Hanneton"
  description: string;
  components: KitComponent[];
  sellingPrice: number;     // Prix de vente du kit en FCFA
  createdAt: string;
  createdBy: string;
}

const STOCK_KITS_KEY = 'gaba-stock-kits';

export function getStockKits(): StockKit[] {
  const data = localStorage.getItem(STOCK_KITS_KEY);
  return data ? JSON.parse(data) : [];
}

function saveStockKits(kits: StockKit[]) {
  localStorage.setItem(STOCK_KITS_KEY, JSON.stringify(kits));
  syncFullCollection(TABLES.stockKits, STOCK_KITS_KEY);
}

export function addStockKit(kit: Omit<StockKit, 'id' | 'createdAt'>): StockKit {
  const kits = getStockKits();
  const newKit: StockKit = {
    ...kit,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  kits.push(newKit);
  saveStockKits(kits);
  return newKit;
}

export function updateStockKit(id: string, updates: Partial<Omit<StockKit, 'id' | 'createdAt' | 'createdBy'>>): StockKit | null {
  const kits = getStockKits();
  const idx = kits.findIndex(k => k.id === id);
  if (idx === -1) return null;
  kits[idx] = { ...kits[idx], ...updates };
  saveStockKits(kits);
  return kits[idx];
}

export function deleteStockKit(id: string): boolean {
  const kits = getStockKits();
  const filtered = kits.filter(k => k.id !== id);
  if (filtered.length === kits.length) return false;
  saveStockKits(filtered);
  return true;
}

/** Check if all components are available in stock for selling N kits */
export function checkKitAvailability(kitId: string, quantity: number = 1): { available: boolean; missing: { itemName: string; required: number; available: number }[] } {
  const kit = getStockKits().find(k => k.id === kitId);
  if (!kit) return { available: false, missing: [{ itemName: 'Kit introuvable', required: 0, available: 0 }] };

  const items = getStockItems();
  const missing: { itemName: string; required: number; available: number }[] = [];

  for (const comp of kit.components) {
    const item = items.find(i => i.id === comp.stockItemId);
    if (!item) {
      missing.push({ itemName: `Article #${comp.stockItemId.slice(0, 8)}...`, required: comp.quantity * quantity, available: 0 });
      continue;
    }
    const required = comp.quantity * quantity;
    if (item.currentQuantity < required) {
      missing.push({ itemName: item.name, required, available: item.currentQuantity });
    }
  }

  return { available: missing.length === 0, missing };
}

/** Sell one or more kits — auto deduct all components from stock.
 * Returns success/failure + list of movements created. */
export function sellKit(
  kitId: string, quantity: number, date: string, createdBy: string, clientName?: string,
): { success: boolean; error?: string; movements?: StockMovement[] } {
  const kit = getStockKits().find(k => k.id === kitId);
  if (!kit) return { success: false, error: 'Kit introuvable' };

  const check = checkKitAvailability(kitId, quantity);
  if (!check.available) {
    const missingStr = check.missing.map(m => `${m.itemName}: besoin ${m.required}, dispo ${m.available}`).join('; ');
    return { success: false, error: `Stock insuffisant — ${missingStr}` };
  }

  const movements: StockMovement[] = [];
  for (const comp of kit.components) {
    const result = addStockMovement(
      comp.stockItemId,
      'exit',
      comp.quantity * quantity,
      0,
      `Vente kit "${kit.name}"${quantity > 1 ? ` ×${quantity}` : ''}${clientName ? ` — ${clientName}` : ''}`,
      date,
      createdBy,
    );
    if (!result.success) {
      return { success: false, error: result.error };
    }
    if (result.movement) movements.push(result.movement);
  }
  return { success: true, movements };
}
