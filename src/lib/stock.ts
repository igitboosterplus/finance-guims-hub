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
  unitPrice: number;   // prix unitaire indicatif en FCFA
  createdAt: string;
}

export type MovementType = 'entry' | 'exit' | 'adjustment';

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
}

const STOCK_ITEMS_KEY = 'gaba-stock-items';
const STOCK_MOVEMENTS_KEY = 'gaba-stock-movements';

// ==================== ITEMS ====================

export function getStockItems(): StockItem[] {
  const data = localStorage.getItem(STOCK_ITEMS_KEY);
  return data ? JSON.parse(data) : [];
}

function saveStockItems(items: StockItem[]) {
  localStorage.setItem(STOCK_ITEMS_KEY, JSON.stringify(items));
  syncFullCollection(TABLES.stockItems, STOCK_ITEMS_KEY);
}

export function addStockItem(item: Omit<StockItem, 'id' | 'createdAt' | 'currentQuantity'>): StockItem {
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

export function updateStockItem(id: string, updates: Partial<Pick<StockItem, 'name' | 'unit' | 'alertThreshold' | 'unitPrice' | 'categoryId'>>): StockItem | null {
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
): { success: boolean; movement?: StockMovement; error?: string } {
  const items = getStockItems();
  const idx = items.findIndex(i => i.id === itemId);
  if (idx === -1) return { success: false, error: 'Article introuvable' };

  const item = items[idx];
  const previousQuantity = item.currentQuantity;
  let newQuantity: number;

  if (type === 'entry') {
    newQuantity = previousQuantity + quantity;
  } else if (type === 'exit') {
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
  if (unitPrice > 0) items[idx].unitPrice = unitPrice;
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
    unitPrice,
    reason,
    date,
    createdAt: new Date().toISOString(),
    createdBy,
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
  const totalValue = items.reduce((sum, i) => sum + i.currentQuantity * i.unitPrice, 0);
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
  const headers = ['Catégorie', 'Article', 'Unité', 'Quantité', 'Seuil alerte', 'Prix unitaire (FCFA)', 'Valeur stock (FCFA)'];
  const rows = items
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
    .map(item => [
      getCategoryLabel(item.categoryId),
      `"${item.name.replace(/"/g, '""')}"`,
      item.unit,
      item.currentQuantity,
      item.alertThreshold,
      item.unitPrice,
      item.currentQuantity * item.unitPrice,
    ].join(';'));
  return [headers.join(';'), ...rows].join('\n');
}
