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

export interface TrainingMaterial {
  itemId: string;
  quantity: number;
}

export interface TrainingGift {
  traineeName: string;
  itemId: string;
  quantity: number;
}

export interface Training {
  id: string;
  parkName: string;
  date: string;
  description: string;
  trainees: string[];          // noms des formés
  materialsUsed: TrainingMaterial[];
  giftsGiven: TrainingGift[];
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
  const totalValue = items.reduce((sum, i) => sum + i.currentQuantity * i.purchasePrice, 0);
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
      item.currentQuantity * item.purchasePrice,
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

export function addTraining(training: Omit<Training, 'id' | 'createdAt'>): Training {
  const trainings = getTrainings();
  const newTraining: Training = {
    ...training,
    id: crypto.randomUUID(),
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
