import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, Plus, ArrowDownToLine, ArrowUpFromLine, BarChart3, AlertTriangle,
  Pencil, Trash2, History, Search, Download, SlidersHorizontal, ArrowLeft,
  Box, Layers, FileDown, GraduationCap, Gift, Boxes, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getCurrentUser, getUserPermissions, hasDepartmentAccess } from "@/lib/auth";
import { formatCurrency, departments, type DepartmentId, addTransaction, getPaymentMethodsForDepartment, type PaymentMethod, getTransactionsByDepartment, updateTransaction } from "@/lib/data";
import { downloadStockReport } from "@/lib/reports";
import { ReportDialog } from "@/components/ReportDialog";
import {
  getStockCategoriesForDept, getStockItems, addStockItem, updateStockItem, deleteStockItem,
  addStockMovement, getStockMovements, getStockStats, getStockEconomicsSummary, getCategoryLabel,
  exportStockCSV, getTrainings, addTraining, updateTraining, deleteTraining,
  getStockKits, addStockKit, updateStockKit, deleteStockKit, checkKitAvailability, sellKit, useKitForTraining,
  getFormationsByDepartment, getEnrollmentsByFormation, addEnrollment, deliverEnrollmentKit,
  generateSaleTicketNumber, updateStockMovementLink,
  type StockItem, type StockMovement, type MovementType, type Training, type TrainingType, type TraineeKit,
  type StockKit, type KitComponent, type TrainingKitUsage, type FormationCatalog,
} from "@/lib/stock";
import { isOnOrAfterCalendarDate } from "@/lib/transactionDates";

const UNITS = ['pièce', 'kg', 'sac', 'litre', 'carton', 'boîte', 'dose', 'lot'];
const ENTRY_REASONS = ['Achat', 'Don reçu', 'Production', 'Retour', 'Autre'];
const EXIT_REASONS = ['Vente', 'Utilisation', 'Perte/Mortalité', 'Don', 'Autre'];
const TRAINING_REASONS = ['Usage formation', 'Substrat formation', 'Démonstration', 'Autre'];
const GIFT_REASONS = ['Don au formé', 'Kit de démarrage', 'Échantillon', 'Autre'];
const FINANCIAL_ENTRY_REASON = 'Achat';
const DECIMAL_STEP = '0.01';

type StockCorrectionMode = 'create-movement' | 'link-transaction' | 'create-transaction';
type StockCorrectionTarget =
  | { kind: 'missing-movement'; transactionId: string }
  | { kind: 'orphan-movement'; movementId: string }
  | { kind: 'broken-movement'; movementId: string };

type GabaCategoryId = 'foss' | 'escargot' | 'champignon' | 'poisson' | 'autre';

interface GabaCategoryDef {
  id: GabaCategoryId;
  label: string;
  keywords: string[];
}

interface GabaLearnerEnrollment {
  enrollmentId: string;
  formationId: string;
  formationName: string;
  packId?: string;
  packName?: string;
  enrolledAt: string;
  matchesSelectedCategory: boolean;
}

interface GabaLearnerOption {
  key: string;
  fullName: string;
  phone?: string;
  enrollments: GabaLearnerEnrollment[];
}

const GABA_CATEGORIES: GabaCategoryDef[] = [
  { id: 'foss', label: 'Foss', keywords: ['foss', 'fosse'] },
  { id: 'escargot', label: 'Escargot', keywords: ['escargot'] },
  { id: 'champignon', label: 'Champignon', keywords: ['champignon'] },
  { id: 'poisson', label: 'Poisson', keywords: ['poisson', 'pisciculture'] },
  { id: 'autre', label: 'Autre', keywords: [] },
];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const matchesGabaCategory = (formation: FormationCatalog, category: GabaCategoryDef): boolean => {
  if (category.id === 'autre') return true;
  const haystack = normalizeText(`${formation.name} ${formation.description || ''}`);
  return category.keywords.some(keyword => haystack.includes(normalizeText(keyword)));
};

const parseDecimal = (value: string) => Number.parseFloat(value.replace(',', '.'));
const formatQuantity = (value: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);

export default function GabaStockPage({ departmentId = 'gaba' as DepartmentId }: { departmentId?: DepartmentId }) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const userPermissions = getUserPermissions(user);
  const dept = departments.find(d => d.id === departmentId)!;
  const STOCK_CATEGORIES = getStockCategoriesForDept(departmentId);

  // --- Data ---
  const [items, setItems] = useState<StockItem[]>(() => getStockItems(departmentId));
  const [movements, setMovements] = useState<StockMovement[]>(() => getStockMovements(departmentId));
  const [trainings, setTrainings] = useState<Training[]>(() => getTrainings(departmentId));
  const [kits, setKits] = useState<StockKit[]>(() => getStockKits(departmentId));
  const stats = useMemo(() => getStockStats(departmentId), [items, movements]);
  const stockEconomics = useMemo(() => getStockEconomicsSummary(departmentId), [departmentId, movements, items]);

  const refresh = () => {
    setItems(getStockItems(departmentId));
    setMovements(getStockMovements(departmentId));
    setTrainings(getTrainings(departmentId));
    setKits(getStockKits(departmentId));
  };

  // --- Filters ---
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [tab, setTab] = useState('items');

  // --- Item dialog ---
  const [itemDialog, setItemDialog] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', categoryId: 'geniteurs', unit: 'pièce', alertThreshold: '5', purchasePrice: '0', sellingPrice: '0' });

  // --- Movement dialog ---
  const [moveDialog, setMoveDialog] = useState(false);
  const [moveType, setMoveType] = useState<MovementType>('entry');
  const [moveItemId, setMoveItemId] = useState('');
  const [moveForm, setMoveForm] = useState({
    quantity: '',
    unitPrice: '',
    reason: '',
    date: new Date().toISOString().slice(0, 10),
    parkName: '',
    traineeName: '',
    transactionId: '',
    paymentMethod: (getPaymentMethodsForDepartment(departmentId)[0]?.value ?? 'especes') as PaymentMethod,
    supplierName: '',
    supplierPhone: '',
    priceVarianceNote: '',
  });

  // --- Training dialog ---
  const [trainingDialog, setTrainingDialog] = useState(false);
  const [gabaLearnerToAdd, setGabaLearnerToAdd] = useState('');
  const [trainingForm, setTrainingForm] = useState({
    trainingType: 'gaba' as TrainingType,
    parkName: '', date: new Date().toISOString().slice(0, 10), enrollmentDate: new Date().toISOString().slice(0, 10), description: '',
    gabaCategory: 'foss' as GabaCategoryId,
    selectedLearnerKeys: [] as string[],
    trainees: '' as string, // legacy support for existing flows
    tranche: '' as string, // Guims Academy
    materials: [] as { itemId: string; quantity: string }[],
    gifts: [] as { traineeName: string; itemId: string; quantity: string }[],
    traineeKits: [] as { traineeName: string; starterKitHannetons: string; hasBook: boolean; selectedPackId?: string; selectedPackName?: string; enrollmentId?: string; enrolledFormationId?: string; enrolledFormationName?: string; enrollmentDate?: string; }[],
    kitUsages: [] as { kitId: string; quantity: string }[],
  });

  // --- Delete dialog ---
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTrainingId, setDeleteTrainingId] = useState<string | null>(null);

  // --- Item history dialog ---
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);

  // --- Stock report dialog ---
  const [stockReportOpen, setStockReportOpen] = useState(false);

  // --- Kit dialogs ---
  const [kitDialog, setKitDialog] = useState(false);
  const [editKit, setEditKit] = useState<StockKit | null>(null);
  const [kitForm, setKitForm] = useState({ name: '', description: '', sellingPrice: '', components: [] as { stockItemId: string; quantity: string }[] });
  const [sellKitDialog, setSellKitDialog] = useState(false);
  const [sellKitId, setSellKitId] = useState<string | null>(null);
  const [sellKitForm, setSellKitForm] = useState({ quantity: '1', date: new Date().toISOString().slice(0, 10), clientName: '', phoneNumber: '', paymentMethod: 'especes' as PaymentMethod, description: '' });
  const [deleteKitId, setDeleteKitId] = useState<string | null>(null);
  const [correctionDialog, setCorrectionDialog] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<StockCorrectionTarget | null>(null);
  const [correctionMode, setCorrectionMode] = useState<StockCorrectionMode>('create-movement');
  const [correctionForm, setCorrectionForm] = useState({
    itemId: '',
    movementId: '',
    transactionId: '',
    quantity: '',
    unitPrice: '',
    amount: '',
    paymentMethod: getPaymentMethodsForDepartment(departmentId)[0]?.value ?? 'especes',
    personName: '',
    phoneNumber: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    reason: 'Vente',
  });

  // ==================== FILTERED DATA ====================

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterCategory !== 'all') result = result.filter(i => i.categoryId === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || getCategoryLabel(i.categoryId, departmentId).toLowerCase().includes(q));
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [items, filterCategory, search]);

  const filteredMovements = useMemo(() => {
    let result = [...movements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m => {
        const item = items.find(i => i.id === m.itemId);
        return item?.name.toLowerCase().includes(q) || m.reason.toLowerCase().includes(q);
      });
    }
    return result;
  }, [movements, search, items]);

  const itemMovements = useMemo(() => {
    if (!historyItem) return [];
    return movements
      .filter(m => m.itemId === historyItem.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [historyItem, movements]);

  const departmentTransactions = useMemo(
    () => getTransactionsByDepartment(departmentId as DepartmentId),
    [departmentId, movements],
  );

  const incomeTransactions = useMemo(
    () => departmentTransactions
      .filter(tx => tx.type === 'income')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [departmentTransactions],
  );

  const transactionsById = useMemo(
    () => new Map(departmentTransactions.map(tx => [tx.id, tx])),
    [departmentTransactions],
  );

  const gabaCategoryDefinition = useMemo(
    () => GABA_CATEGORIES.find(category => category.id === trainingForm.gabaCategory) ?? GABA_CATEGORIES[0],
    [trainingForm.gabaCategory],
  );

  const gabaFormations = useMemo(
    () => getFormationsByDepartment('gaba'),
    [trainings],
  );

  const formationPackNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const formation of gabaFormations) {
      for (const pack of formation.packs) {
        map.set(`${formation.id}::${pack.id}`, pack.name);
      }
    }
    return map;
  }, [gabaFormations]);

  const categoryFormations = useMemo(
    () => gabaFormations.filter(formation => matchesGabaCategory(formation, gabaCategoryDefinition)),
    [gabaFormations, gabaCategoryDefinition],
  );

  const categoryPackOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    for (const formation of categoryFormations) {
      for (const pack of formation.packs) {
        options.push({
          value: `${formation.id}::${pack.id}`,
          label: `${formation.name} - ${pack.name}`,
        });
      }
    }
    return options;
  }, [categoryFormations]);

  const learnerOptions = useMemo(() => {
    const byLearner = new Map<string, GabaLearnerOption>();

    for (const formation of gabaFormations) {
      const enrollmentsForFormation = getEnrollmentsByFormation(formation.id);
      for (const enrollment of enrollmentsForFormation) {
        const key = normalizeText(enrollment.fullName);
        if (!key) continue;
        const existing = byLearner.get(key);
        const matchesSelectedCategory = categoryFormations.some(item => item.id === formation.id);
        const packName = enrollment.packId ? formationPackNameById.get(`${formation.id}::${enrollment.packId}`) : undefined;

        const enrollmentInfo: GabaLearnerEnrollment = {
          enrollmentId: enrollment.id,
          formationId: formation.id,
          formationName: formation.name,
          packId: enrollment.packId,
          packName,
          enrolledAt: enrollment.enrolledAt,
          matchesSelectedCategory,
        };

        if (!existing) {
          byLearner.set(key, {
            key,
            fullName: enrollment.fullName,
            phone: enrollment.phone,
            enrollments: [enrollmentInfo],
          });
          continue;
        }

        existing.enrollments.push(enrollmentInfo);
        if (!existing.phone && enrollment.phone) {
          existing.phone = enrollment.phone;
        }
      }
    }

    return [...byLearner.values()]
      .map((learner) => ({
        ...learner,
        enrollments: learner.enrollments.sort((a, b) => new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime()),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr', { sensitivity: 'base' }));
  }, [categoryFormations, formationPackNameById, gabaFormations]);

  const learnerByKey = useMemo(
    () => new Map(learnerOptions.map(learner => [learner.key, learner])),
    [learnerOptions],
  );

  const selectedLearners = useMemo(
    () => trainingForm.selectedLearnerKeys.map(key => learnerByKey.get(key)).filter(Boolean) as GabaLearnerOption[],
    [learnerByKey, trainingForm.selectedLearnerKeys],
  );

  const stockControl = useMemo(() => {
    const saleLinkCutoff = new Date();
    const stockTxs = departmentTransactions
      .filter(tx => tx.type === 'income' && (tx.stockItemId || tx.saleTicketNumber || tx.category.toLowerCase().includes('vente')))
      .filter(tx => isOnOrAfterCalendarDate(tx.date, saleLinkCutoff));

    const movementByTxId = new Map<string, StockMovement>();
    const movementByTicket = new Map<string, StockMovement>();
    const saleMovements = movements.filter(
      mv => mv.type === 'exit' && mv.reason.toLowerCase().includes('vente') && isOnOrAfterCalendarDate(mv.date, saleLinkCutoff),
    );

    saleMovements.forEach((mv) => {
      if (mv.transactionId) movementByTxId.set(mv.transactionId, mv);
      if (mv.saleTicketNumber) movementByTicket.set(mv.saleTicketNumber, mv);
    });

    const missingMovementTxs = stockTxs.filter((tx) => {
      const byId = movementByTxId.get(tx.id);
      const byTicket = tx.saleTicketNumber ? movementByTicket.get(tx.saleTicketNumber) : undefined;
      return !byId && !byTicket;
    });

    const orphanSaleMovements = saleMovements.filter(mv => !mv.transactionId && !mv.saleTicketNumber);
    const brokenLinkedMovements = saleMovements.filter(mv => mv.transactionId && !stockTxs.some(tx => tx.id === mv.transactionId));

    const criticalLowItems = items
      .filter(item => item.alertThreshold > 0 && item.currentQuantity <= item.alertThreshold / 2)
      .sort((a, b) => a.currentQuantity - b.currentQuantity);

    return {
      missingMovementTxs,
      orphanSaleMovements,
      brokenLinkedMovements,
      criticalLowItems,
      flaggedMovementIds: new Set<string>([
        ...orphanSaleMovements.map(mv => mv.id),
        ...brokenLinkedMovements.map(mv => mv.id),
      ]),
    };
  }, [departmentTransactions, movements, items]);

  const quickOpenMovementForRestock = (itemId: string) => {
    openMovement('entry', itemId);
  };

  const allowedExitReasons = useMemo(
    () => userPermissions.canRecordStockExitWithoutPrice ? EXIT_REASONS : EXIT_REASONS.filter(reason => reason === 'Vente'),
    [userPermissions.canRecordStockExitWithoutPrice],
  );

  const selectedMoveItem = useMemo(
    () => items.find(i => i.id === moveItemId),
    [items, moveItemId],
  );

  const isFinancialEntry = useMemo(
    () => moveType === 'entry' && moveForm.reason === FINANCIAL_ENTRY_REASON,
    [moveType, moveForm.reason],
  );

  const entryUnitPrice = useMemo(() => {
    const parsed = parseDecimal(moveForm.unitPrice);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [moveForm.unitPrice]);

  const entryTotal = useMemo(() => {
    if (!isFinancialEntry) return 0;
    const qty = parseDecimal(moveForm.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    if (!Number.isFinite(entryUnitPrice) || entryUnitPrice <= 0) return 0;
    return qty * entryUnitPrice;
  }, [isFinancialEntry, moveForm.quantity, entryUnitPrice]);

  const purchaseReferencePrice = selectedMoveItem?.purchasePrice ?? 0;
  const purchasePriceDelta = isFinancialEntry ? entryUnitPrice - purchaseReferencePrice : 0;
  const hasPurchasePriceDelta = isFinancialEntry && purchaseReferencePrice > 0 && Math.abs(purchasePriceDelta) > 0.0001;

  const openCorrectionForMissingMovement = (transactionId: string) => {
    const tx = transactionsById.get(transactionId);
    if (!tx) return;

    const quantity = typeof tx.quantity === 'number' && tx.quantity > 0 ? String(tx.quantity) : '';
    const inferredPrice = typeof tx.quantity === 'number' && tx.quantity > 0 ? String(tx.amount / tx.quantity) : '';

    setCorrectionTarget({ kind: 'missing-movement', transactionId });
    setCorrectionMode('create-movement');
    setCorrectionForm({
      itemId: tx.stockItemId || items[0]?.id || '',
      movementId: '',
      transactionId: tx.id,
      quantity,
      unitPrice: inferredPrice,
      amount: String(tx.amount),
      paymentMethod: tx.paymentMethod,
      personName: tx.personName || '',
      phoneNumber: tx.phoneNumber || '',
      description: tx.description || tx.category,
      date: tx.date,
      reason: 'Vente',
    });
    setCorrectionDialog(true);
  };

  const openCorrectionForMovement = (movementId: string, mode: StockCorrectionMode) => {
    const movement = movements.find(entry => entry.id === movementId);
    if (!movement) return;
    const linkedTx = movement.transactionId ? transactionsById.get(movement.transactionId) : undefined;

    setCorrectionTarget({ kind: movement.transactionId ? 'broken-movement' : 'orphan-movement', movementId });
    setCorrectionMode(mode);
    setCorrectionForm({
      itemId: movement.itemId,
      movementId: movement.id,
      transactionId: linkedTx?.id || '',
      quantity: String(movement.quantity),
      unitPrice: movement.unitPrice > 0 ? String(movement.unitPrice) : '',
      amount: linkedTx ? String(linkedTx.amount) : movement.unitPrice > 0 ? String(movement.unitPrice * movement.quantity) : '',
      paymentMethod: linkedTx?.paymentMethod || getPaymentMethodsForDepartment(departmentId)[0]?.value || 'especes',
      personName: linkedTx?.personName || '',
      phoneNumber: linkedTx?.phoneNumber || '',
      description: linkedTx?.description || movement.reason,
      date: linkedTx?.date || movement.date,
      reason: movement.reason || 'Vente',
    });
    setCorrectionDialog(true);
  };

  const handleApplyCorrection = () => {
    if (!correctionTarget) return;

    if (correctionMode === 'create-movement') {
      const qty = parseDecimal(correctionForm.quantity);
      const unitPrice = correctionForm.unitPrice.trim() ? parseDecimal(correctionForm.unitPrice) : 0;
      if (!correctionForm.itemId) { toast.error('Article à sortir requis'); return; }
      if (!Number.isFinite(qty) || qty <= 0) { toast.error('Quantité invalide'); return; }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) { toast.error('Prix unitaire invalide'); return; }

      const tx = transactionsById.get(correctionTarget.transactionId);
      if (!tx) { toast.error('Transaction introuvable'); return; }

      const saleTicketNumber = tx.saleTicketNumber || generateSaleTicketNumber(new Date(correctionForm.date));
      const result = addStockMovement(
        correctionForm.itemId,
        'exit',
        qty,
        unitPrice,
        correctionForm.reason.trim() || 'Vente',
        correctionForm.date,
        user?.displayName ?? 'Inconnu',
        undefined,
        undefined,
        departmentId,
        tx.id,
        saleTicketNumber,
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      updateTransaction(tx.id, {
        stockItemId: correctionForm.itemId,
        quantity: qty,
        saleTicketNumber,
      });

      toast.success('Sortie stock créée et liée à la transaction');
      setCorrectionDialog(false);
      refresh();
      return;
    }

    const movement = movements.find(entry => entry.id === correctionTarget.movementId);
    if (!movement) { toast.error('Mouvement introuvable'); return; }

    if (correctionMode === 'link-transaction') {
      if (!correctionForm.transactionId) { toast.error('Sélectionnez une transaction'); return; }
      const tx = transactionsById.get(correctionForm.transactionId);
      if (!tx) { toast.error('Transaction introuvable'); return; }

      const alreadyLinked = movements.find(entry => entry.id !== movement.id && entry.transactionId === tx.id);
      if (alreadyLinked) {
        toast.error('Cette transaction est déjà liée à un autre mouvement');
        return;
      }

      const saleTicketNumber = movement.saleTicketNumber || tx.saleTicketNumber || generateSaleTicketNumber(new Date(correctionForm.date));
      updateStockMovementLink(movement.id, { transactionId: tx.id, saleTicketNumber }, departmentId);
      updateTransaction(tx.id, {
        stockItemId: movement.itemId,
        quantity: movement.quantity,
        saleTicketNumber,
      });

      toast.success('Mouvement relié à la transaction');
      setCorrectionDialog(false);
      refresh();
      return;
    }

    const amount = parseDecimal(correctionForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Montant invalide'); return; }

    const saleTicketNumber = movement.saleTicketNumber || generateSaleTicketNumber(new Date(correctionForm.date));
    const createdTx = addTransaction({
      departmentId: departmentId as DepartmentId,
      type: 'income',
      paymentMethod: correctionForm.paymentMethod,
      category: 'Vente stock',
      personName: correctionForm.personName.trim() || 'Client',
      phoneNumber: correctionForm.phoneNumber.trim() || undefined,
      description: correctionForm.description.trim() || movement.reason,
      amount,
      date: correctionForm.date,
      quantity: movement.quantity,
      stockItemId: movement.itemId,
      saleTicketNumber,
    });

    updateStockMovementLink(movement.id, { transactionId: createdTx.id, saleTicketNumber }, departmentId);
    toast.success('Transaction créée et liée au mouvement');
    setCorrectionDialog(false);
    refresh();
  };

  // --- Access check (after all hooks) ---
  if (!hasDepartmentAccess(user, departmentId)) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Vous n'avez pas accès au stock {dept.name}</p>
        <p className="text-sm">Contactez le Super Admin pour obtenir l'accès.</p>
      </div>
    );
  }

  // ==================== HANDLERS ====================

  const openNewItem = () => {
    setEditItem(null);
    setItemForm({ name: '', categoryId: 'geniteurs', unit: 'pièce', alertThreshold: '5', purchasePrice: '0', sellingPrice: '0' });
    setItemDialog(true);
  };

  const openEditItem = (item: StockItem) => {
    setEditItem(item);
    setItemForm({
      name: item.name,
      categoryId: item.categoryId,
      unit: item.unit,
      alertThreshold: String(item.alertThreshold),
      purchasePrice: String(item.purchasePrice),
      sellingPrice: String(item.sellingPrice),
    });
    setItemDialog(true);
  };

  const handleSaveItem = () => {
    if (!itemForm.name.trim()) { toast.error('Nom de l\'article requis'); return; }
    const threshold = parseDecimal(itemForm.alertThreshold);
    const pPrice = parseDecimal(itemForm.purchasePrice);
    const sPrice = parseDecimal(itemForm.sellingPrice);
    if (isNaN(threshold) || threshold < 0) { toast.error('Seuil d\'alerte invalide'); return; }
    if (isNaN(pPrice) || pPrice < 0) { toast.error('Prix d\'achat invalide'); return; }
    if (isNaN(sPrice) || sPrice < 0) { toast.error('Prix de vente invalide'); return; }

    if (editItem) {
      updateStockItem(editItem.id, {
        name: itemForm.name.trim(),
        categoryId: itemForm.categoryId,
        unit: itemForm.unit,
        alertThreshold: threshold,
        purchasePrice: pPrice,
        sellingPrice: sPrice,
      }, departmentId);
      toast.success('Article modifié');
    } else {
      addStockItem({
        name: itemForm.name.trim(),
        categoryId: itemForm.categoryId,
        unit: itemForm.unit,
        alertThreshold: threshold,
        purchasePrice: pPrice,
        sellingPrice: sPrice,
      }, departmentId);
      toast.success('Article ajouté au stock');
    }
    setItemDialog(false);
    refresh();
  };

  const handleDeleteItem = () => {
    if (!deleteId) return;
    deleteStockItem(deleteId, departmentId);
    toast.success('Article supprimé');
    setDeleteId(null);
    refresh();
  };

  const openMovement = (type: MovementType, itemId?: string) => {
    const selectedItemId = itemId ?? (items.length > 0 ? items[0].id : '');
    const selectedItem = items.find(i => i.id === selectedItemId);
    setMoveType(type);
    setMoveItemId(selectedItemId);
    const defaultReason = type === 'entry'
      ? ENTRY_REASONS[0]
      : type === 'training'
        ? TRAINING_REASONS[0]
        : type === 'gift'
          ? GIFT_REASONS[0]
          : allowedExitReasons[0];
    setMoveForm({
      quantity: '',
      unitPrice: type === 'entry' && defaultReason === FINANCIAL_ENTRY_REASON && (selectedItem?.purchasePrice ?? 0) > 0
        ? String(selectedItem?.purchasePrice ?? 0)
        : '',
      reason: defaultReason,
      date: new Date().toISOString().slice(0, 10),
      parkName: '',
      traineeName: '',
      transactionId: '',
      paymentMethod: (getPaymentMethodsForDepartment(departmentId)[0]?.value ?? 'especes') as PaymentMethod,
      supplierName: '',
      supplierPhone: '',
      priceVarianceNote: '',
    });
    setMoveDialog(true);
  };

  const handleSaveMovement = () => {
    const qty = parseDecimal(moveForm.quantity);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantité invalide'); return; }
    const price = moveType === 'entry'
      ? (isFinancialEntry ? (parseDecimal(moveForm.unitPrice) || 0) : 0)
      : (moveType === 'training' || moveType === 'gift')
        ? 0
        : (parseDecimal(moveForm.unitPrice) || 0);
    if (isFinancialEntry && price <= 0) { toast.error('Prix unitaire requis pour un achat'); return; }
    if (isFinancialEntry && !moveForm.paymentMethod) { toast.error('Veuillez sélectionner la caisse de retrait'); return; }
    if (isFinancialEntry && !moveForm.supplierName.trim()) { toast.error('Fournisseur requis pour une entrée payante'); return; }
    if (hasPurchasePriceDelta && !moveForm.priceVarianceNote.trim()) {
      toast.error('Veuillez préciser la raison de l\'écart de prix avec la référence');
      return;
    }
    if (!moveForm.reason.trim()) { toast.error('Motif requis'); return; }
    if (moveType === 'exit' && moveForm.reason !== 'Vente' && !userPermissions.canRecordStockExitWithoutPrice) {
      toast.error('Seuls les utilisateurs autorisés par le Super Admin peuvent enregistrer une sortie sans prix');
      return;
    }
    if ((moveType === 'training' || moveType === 'gift') && !moveForm.parkName.trim()) { toast.error('Nom du parc requis'); return; }
    if (moveType === 'gift' && !moveForm.traineeName.trim()) { toast.error('Nom du formé requis'); return; }

    const result = addStockMovement(
      moveItemId,
      moveType,
      qty,
      price,
      moveForm.reason.trim(),
      moveForm.date,
      user?.displayName ?? 'Inconnu',
      moveForm.parkName.trim() || undefined,
      moveForm.traineeName.trim() || undefined,
      departmentId,
      moveForm.transactionId || undefined,
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    if (isFinancialEntry && price > 0) {
      const item = items.find(i => i.id === moveItemId);
      const totalAmount = qty * price;
      const priceDeltaText = hasPurchasePriceDelta
        ? ` | Réf: ${formatCurrency(purchaseReferencePrice)} | Écart: ${purchasePriceDelta > 0 ? '+' : ''}${formatCurrency(purchasePriceDelta)}`
        : '';
      const linkedExpense = addTransaction({
        departmentId: departmentId as DepartmentId,
        type: 'expense',
        paymentMethod: moveForm.paymentMethod,
        category: 'Achat stock',
        personName: moveForm.supplierName.trim(),
        phoneNumber: moveForm.supplierPhone.trim() || undefined,
        description: `${moveForm.reason.trim()} - ${item?.name ?? 'Article'} (${formatQuantity(qty)} ${item?.unit ?? ''} x ${formatCurrency(price)})${priceDeltaText}${hasPurchasePriceDelta ? ` | Note: ${moveForm.priceVarianceNote.trim()}` : ''}`,
        amount: totalAmount,
        date: moveForm.date,
      });

      if (result.movement) {
        updateStockMovementLink(result.movement.id, { transactionId: linkedExpense.id }, departmentId);
      }
    }

    const labels: Record<MovementType, string> = { entry: 'Entrée enregistrée', exit: 'Sortie enregistrée', adjustment: 'Ajustement enregistré', training: 'Usage formation enregistré', gift: 'Don au formé enregistré' };
    if (isFinancialEntry && price > 0) {
      toast.success(`Entrée enregistrée. Dépense de ${formatCurrency(qty * price)} imputée à la caisse sélectionnée.`);
    } else {
      toast.success(labels[moveType]);
    }
    setMoveDialog(false);
    refresh();
  };

  const setTraineePackSelection = (traineeName: string, optionValue: string) => {
    setTrainingForm((prev) => ({
      ...prev,
      traineeKits: prev.traineeKits.map((kit) => {
        if (kit.traineeName !== traineeName) return kit;
        if (!optionValue || optionValue === '__none__') {
          return {
            ...kit,
            selectedPackId: undefined,
            selectedPackName: undefined,
          };
        }

        return {
          ...kit,
          selectedPackId: optionValue,
          selectedPackName: formationPackNameById.get(optionValue) ?? optionValue,
        };
      }),
    }));
  };

  const addLearnerToTraining = (learnerKey: string) => {
    const learner = learnerByKey.get(learnerKey);
    if (!learner) {
      toast.error('Apprenant introuvable');
      return;
    }

    const selectedEnrollment = learner.enrollments.find(entry => entry.matchesSelectedCategory) ?? learner.enrollments[0];
    const selectedPackValue = selectedEnrollment?.packId ? `${selectedEnrollment.formationId}::${selectedEnrollment.packId}` : undefined;

    setTrainingForm((prev) => {
      if (prev.selectedLearnerKeys.includes(learnerKey)) return prev;

      return {
        ...prev,
        selectedLearnerKeys: [...prev.selectedLearnerKeys, learnerKey],
        traineeKits: [
          ...prev.traineeKits,
          {
            traineeName: learner.fullName,
            starterKitHannetons: '0',
            hasBook: false,
            ...(selectedEnrollment?.enrollmentId ? { enrollmentId: selectedEnrollment.enrollmentId } : {}),
            ...(selectedEnrollment?.formationId ? { enrolledFormationId: selectedEnrollment.formationId } : {}),
            ...(selectedEnrollment?.formationName ? { enrolledFormationName: selectedEnrollment.formationName } : {}),
            ...(selectedEnrollment?.enrolledAt ? { enrollmentDate: selectedEnrollment.enrolledAt } : {}),
            ...(selectedPackValue ? { selectedPackId: selectedPackValue } : {}),
            ...(selectedEnrollment?.packName ? { selectedPackName: selectedEnrollment.packName } : {}),
          },
        ],
      };
    });

    setGabaLearnerToAdd('');
  };

  const removeLearnerFromTraining = (learnerKey: string) => {
    const learner = learnerByKey.get(learnerKey);
    if (!learner) return;

    setTrainingForm((prev) => ({
      ...prev,
      selectedLearnerKeys: prev.selectedLearnerKeys.filter((key) => key !== learnerKey),
      traineeKits: prev.traineeKits.filter((kit) => kit.traineeName !== learner.fullName),
      gifts: prev.gifts.filter((gift) => gift.traineeName.trim() !== learner.fullName),
    }));
  };

  const buildGabaSessionLabel = () => {
    const categoryLabel = gabaCategoryDefinition.label;
    return `Formation ${categoryLabel} - ${selectedLearners.length} apprenant(s)`;
  };

  // --- Training session handler ---
  const openTrainingDialog = () => {
    setGabaLearnerToAdd('');
    setTrainingForm({
      trainingType: 'gaba',
      parkName: '', date: new Date().toISOString().slice(0, 10), description: '',
      enrollmentDate: new Date().toISOString().slice(0, 10),
      gabaCategory: 'foss',
      selectedLearnerKeys: [],
      trainees: '', tranche: '',
      materials: [{ itemId: items[0]?.id ?? '', quantity: '' }],
      gifts: [],
      traineeKits: [],
      kitUsages: [],
    });
    setTrainingDialog(true);
  };

  const handleSaveTraining = () => {
    const traineeList = trainingForm.trainingType === 'gaba'
      ? selectedLearners.map(learner => learner.fullName)
      : trainingForm.trainees.split(',').map(t => t.trim()).filter(Boolean);

    if (trainingForm.trainingType !== 'gaba' && !trainingForm.parkName.trim()) {
      toast.error('Nom du lieu requis');
      return;
    }

    if (trainingForm.trainingType === 'gaba' && !trainingForm.gabaCategory) {
      toast.error('Sélectionnez la catégorie de formation GABA');
      return;
    }

    if (traineeList.length === 0) { toast.error('Au moins un formé requis'); return; }
    if (trainingForm.trainingType === 'guims-academy' && !trainingForm.tranche) { toast.error('Veuillez sélectionner une tranche'); return; }

    const userName = user?.displayName ?? 'Inconnu';
    const errors: string[] = [];
    const sessionLabel = trainingForm.trainingType === 'gaba'
      ? buildGabaSessionLabel()
      : trainingForm.parkName.trim();

    // Record material usage movements (GABA only)
    if (trainingForm.trainingType === 'gaba') {
      for (const mat of trainingForm.materials) {
        const qty = parseDecimal(mat.quantity);
        if (!mat.itemId || isNaN(qty) || qty <= 0) continue;
        const item = items.find(i => i.id === mat.itemId);
        const result = addStockMovement(mat.itemId, 'training', qty, 0, 'Usage formation', trainingForm.date, userName, sessionLabel, undefined, departmentId);
        if (!result.success) errors.push(`${item?.name}: ${result.error}`);
      }

      // Record gifts movements
      for (const gift of trainingForm.gifts) {
        const qty = parseDecimal(gift.quantity);
        if (!gift.itemId || isNaN(qty) || qty <= 0 || !gift.traineeName.trim()) continue;
        const item = items.find(i => i.id === gift.itemId);
        const result = addStockMovement(gift.itemId, 'gift', qty, 0, `Don à ${gift.traineeName.trim()}`, trainingForm.date, userName, sessionLabel, gift.traineeName.trim(), departmentId);
        if (!result.success) errors.push(`${item?.name} → ${gift.traineeName}: ${result.error}`);
      }

      // Record kit usages
      for (const ku of trainingForm.kitUsages) {
        const qty = parseInt(ku.quantity, 10);
        if (!ku.kitId || isNaN(qty) || qty <= 0) continue;
        const kit = kits.find(k => k.id === ku.kitId);
        const result = useKitForTraining(ku.kitId, qty, trainingForm.date, userName, sessionLabel, departmentId);
        if (!result.success) errors.push(`Kit ${kit?.name}: ${result.error}`);
      }
    }

    const selectedLearnersNotInscrit = selectedLearners
      .filter(learner => !learner.enrollments.some(entry => entry.matchesSelectedCategory))
      .map(learner => learner.fullName);

    // Build trainee kits
    const traineeKits: TraineeKit[] = trainingForm.traineeKits
      .filter(k => k.traineeName.trim())
      .map(k => ({
        traineeName: k.traineeName.trim(),
        starterKitHannetons: parseInt(k.starterKitHannetons, 10) || 0,
        hasBook: k.hasBook,
        ...(k.selectedPackId ? { selectedPackId: k.selectedPackId } : {}),
        ...(k.selectedPackName ? { selectedPackName: k.selectedPackName } : {}),
        ...(k.enrollmentId ? { enrollmentId: k.enrollmentId } : {}),
        ...(k.enrolledFormationId ? { enrolledFormationId: k.enrolledFormationId } : {}),
        ...(k.enrolledFormationName ? { enrolledFormationName: k.enrolledFormationName } : {}),
        ...(k.enrollmentDate ? { enrollmentDate: k.enrollmentDate } : {}),
        otherItems: trainingForm.gifts.filter(g => g.traineeName.trim() === k.traineeName.trim()).map(g => ({
          traineeName: g.traineeName.trim(),
          itemId: g.itemId,
          quantity: parseDecimal(g.quantity) || 0,
        })),
      }));

    const enrolledDates = traineeKits
      .map(kit => kit.enrollmentDate)
      .filter(Boolean) as string[];

    const inferredEnrollmentDate = enrolledDates.length > 0
      ? enrolledDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
      : new Date().toISOString();

    // Save training record
    addTraining({
      trainingType: trainingForm.trainingType,
      ...(trainingForm.trainingType === 'gaba' ? { gabaCategory: trainingForm.gabaCategory } : {}),
      parkName: sessionLabel,
      date: trainingForm.date,
      enrollmentDate: trainingForm.trainingType === 'gaba'
        ? inferredEnrollmentDate
        : (trainingForm.enrollmentDate ? new Date(trainingForm.enrollmentDate).toISOString() : new Date().toISOString()),
      description: trainingForm.description.trim(),
      trainees: traineeList,
      traineeKits,
      materialsUsed: trainingForm.materials.filter(m => m.itemId && parseDecimal(m.quantity) > 0).map(m => ({ itemId: m.itemId, quantity: parseDecimal(m.quantity) })),
      giftsGiven: trainingForm.gifts.filter(g => g.itemId && parseDecimal(g.quantity) > 0 && g.traineeName.trim()).map(g => ({ traineeName: g.traineeName.trim(), itemId: g.itemId, quantity: parseDecimal(g.quantity) })),
      kitsUsed: trainingForm.kitUsages.filter(ku => ku.kitId && parseInt(ku.quantity, 10) > 0).map(ku => ({ kitId: ku.kitId, quantity: parseInt(ku.quantity, 10) })),
      ...(trainingForm.trainingType === 'guims-academy' ? { tranche: trainingForm.tranche } : {}),
      createdBy: userName,
    }, departmentId);

    if (errors.length > 0) {
      toast.error(`Formation enregistrée avec ${errors.length} erreur(s): ${errors[0]}`);
    } else if (selectedLearnersNotInscrit.length > 0 && trainingForm.trainingType === 'gaba') {
      toast.warning(`Formation enregistrée. Non inscrits dans cette catégorie: ${selectedLearnersNotInscrit.join(', ')}`);
    } else {
      toast.success('Formation enregistrée avec succès');
    }
    setTrainingDialog(false);
    refresh();
  };

  const handleDeleteTraining = () => {
    if (!deleteTrainingId) return;
    deleteTraining(deleteTrainingId, departmentId);
    toast.success('Formation supprimée');
    setDeleteTrainingId(null);
    refresh();
  };

  const handleSetKitDelivered = (trainingId: string, traineeName: string, delivered: boolean) => {
    const training = trainings.find(entry => entry.id === trainingId);
    if (!training) {
      toast.error('Formation introuvable');
      return;
    }

    const targetKit = (training.traineeKits || []).find((kit) => kit.traineeName === traineeName);
    if (!targetKit) {
      toast.error('Kit du formé introuvable');
      return;
    }

    let resolvedEnrollmentId = targetKit.enrollmentId;

    if (delivered && !resolvedEnrollmentId) {
      const selectedPackRaw = targetKit.selectedPackId || '';
      const selectedPackParts = selectedPackRaw.includes('::') ? selectedPackRaw.split('::') : [];
      const selectedFormationId = selectedPackParts.length === 2 ? selectedPackParts[0] : targetKit.enrolledFormationId;
      const selectedPackId = selectedPackParts.length === 2 ? selectedPackParts[1] : (selectedPackRaw || undefined);

      const fallbackCategory = GABA_CATEGORIES.find((category) => category.id === (training.gabaCategory || 'autre')) ?? GABA_CATEGORIES[0];
      const formationForEnrollment = selectedFormationId
        ? gabaFormations.find((formation) => formation.id === selectedFormationId)
        : gabaFormations.find((formation) => matchesGabaCategory(formation, fallbackCategory));

      if (!formationForEnrollment) {
        toast.error('Aucune formation GABA trouvée pour créer l\'inscription avant livraison');
        return;
      }

      const existing = getEnrollmentsByFormation(formationForEnrollment.id).find((enrollment) =>
        normalizeText(enrollment.fullName) === normalizeText(traineeName) && enrollment.status !== 'annulé',
      );

      if (existing) {
        resolvedEnrollmentId = existing.id;
      } else {
        const created = addEnrollment({
          formationId: formationForEnrollment.id,
          packId: selectedPackId,
          fullName: traineeName,
          phone: learnerOptions.find((learner) => normalizeText(learner.fullName) === normalizeText(traineeName))?.phone,
          status: 'inscrit',
          kitStatus: 'reserve',
          notes: `Inscription auto créée depuis session ${training.id} pour traçabilité kit`,
          enrolledBy: user?.displayName ?? 'Inconnu',
        });
        resolvedEnrollmentId = created.id;
      }
    }

    if (delivered && resolvedEnrollmentId) {
      const deliveryResult = deliverEnrollmentKit(resolvedEnrollmentId, user?.displayName ?? 'Inconnu', training.date);
      if (!deliveryResult.success) {
        toast.error(deliveryResult.error || 'Impossible de livrer le kit');
        return;
      }
    }

    const now = new Date().toISOString();
    const nextKits = (training.traineeKits || []).map((kit) => {
      if (kit.traineeName !== traineeName) return kit;
      if (delivered) {
        return {
          ...kit,
          ...(resolvedEnrollmentId ? { enrollmentId: resolvedEnrollmentId } : {}),
          delivered: true,
          deliveredAt: now,
          deliveredBy: user?.displayName ?? 'Inconnu',
        };
      }
      return {
        ...kit,
        delivered: false,
        deliveredAt: undefined,
        deliveredBy: undefined,
      };
    });

    const updated = updateTraining(training.id, { traineeKits: nextKits }, departmentId);
    if (!updated) {
      toast.error('Impossible de mettre à jour la livraison');
      return;
    }

    if (!delivered && targetKit.enrollmentId) {
      toast.success('Kit marqué non livré (la sortie de stock déjà faite n\'est pas annulée automatiquement)');
    } else if (delivered && !targetKit.enrollmentId) {
      toast.success('Kit marqué comme livré (sans lien inscription, aucun débit automatique du pack)');
    } else if (delivered) {
      toast.success('Kit marqué comme livré et stock du pack débité');
    } else {
      toast.success('Kit marqué comme non livré');
    }
    refresh();
  };

  const handleExportCSV = () => {
    const csv = exportStockCSV(departmentId);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-${departmentId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Stock exporté en CSV');
  };

  // ==================== KIT HANDLERS ====================

  const openNewKit = () => {
    setEditKit(null);
    setKitForm({ name: '', description: '', sellingPrice: '', components: [{ stockItemId: items[0]?.id ?? '', quantity: '1' }] });
    setKitDialog(true);
  };

  const openEditKit = (kit: StockKit) => {
    setEditKit(kit);
    setKitForm({
      name: kit.name,
      description: kit.description,
      sellingPrice: String(kit.sellingPrice),
      components: kit.components.map(c => ({ stockItemId: c.stockItemId, quantity: String(c.quantity) })),
    });
    setKitDialog(true);
  };

  const handleSaveKit = () => {
    if (!kitForm.name.trim()) { toast.error('Nom du kit requis'); return; }
    const price = parseDecimal(kitForm.sellingPrice);
    if (isNaN(price) || price < 0) { toast.error('Prix de vente invalide'); return; }
    const components: KitComponent[] = kitForm.components
      .filter(c => c.stockItemId && parseDecimal(c.quantity) > 0)
      .map(c => ({ stockItemId: c.stockItemId, quantity: parseDecimal(c.quantity) }));
    if (components.length === 0) { toast.error('Ajoutez au moins un composant'); return; }

    if (editKit) {
      updateStockKit(editKit.id, { name: kitForm.name.trim(), description: kitForm.description.trim(), sellingPrice: price, components }, departmentId);
      toast.success('Kit modifié');
    } else {
      addStockKit({ name: kitForm.name.trim(), description: kitForm.description.trim(), sellingPrice: price, components, createdBy: user?.displayName ?? 'Inconnu' }, departmentId);
      toast.success('Kit créé');
    }
    setKitDialog(false);
    refresh();
  };

  const handleDeleteKit = () => {
    if (!deleteKitId) return;
    deleteStockKit(deleteKitId, departmentId);
    toast.success('Kit supprimé');
    setDeleteKitId(null);
    refresh();
  };

  const openSellKit = (kitId: string) => {
    setSellKitId(kitId);
    setSellKitForm({ quantity: '1', date: new Date().toISOString().slice(0, 10), clientName: '', phoneNumber: '', paymentMethod: 'especes', description: '' });
    setSellKitDialog(true);
  };

  const handleSellKit = () => {
    if (!sellKitId) return;
    const qty = parseInt(sellKitForm.quantity);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantité invalide'); return; }
    const kit = kits.find(k => k.id === sellKitId);
    if (!kit) { toast.error('Kit introuvable'); return; }
    const result = sellKit(sellKitId, qty, sellKitForm.date, user?.displayName ?? 'Inconnu', sellKitForm.clientName.trim() || undefined, departmentId);
    if (!result.success) { toast.error(result.error ?? 'Erreur'); return; }
    // Auto-create transaction for the kit sale
    const totalAmount = kit.sellingPrice * qty;
    addTransaction({
      departmentId: departmentId as DepartmentId,
      type: 'income',
      paymentMethod: sellKitForm.paymentMethod,
      category: 'Vente kit',
      personName: sellKitForm.clientName.trim() || 'Client',
      phoneNumber: sellKitForm.phoneNumber.trim() || undefined,
      description: sellKitForm.description.trim() || `Vente kit "${kit.name}"${qty > 1 ? ` ×${qty}` : ''}`,
      amount: totalAmount,
      date: sellKitForm.date,
    });
    toast.success(`Kit vendu (${formatCurrency(totalAmount)}) — transaction enregistrée`);
    setSellKitDialog(false);
    refresh();
  };

  const getItemById = (id: string) => items.find(i => i.id === id);

  // ==================== RENDER ====================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-2xl ${dept.bgLightClass} p-6`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/department/${departmentId}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={dept.logo} alt={dept.name} className="h-14 w-14 rounded-2xl object-cover shadow-md bg-card" />
            <div>
              <h2 className="text-2xl font-bold text-foreground">Gestion des Stocks — {dept.name}</h2>
              <p className="text-sm text-muted-foreground">{dept.description}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="gap-2" onClick={openNewItem}>
              <Plus className="h-4 w-4" /> Nouvel article
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => openMovement('entry')}>
              <ArrowDownToLine className="h-4 w-4" /> Entrée
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => openMovement('exit')}>
              <ArrowUpFromLine className="h-4 w-4" /> Sortie
            </Button>
            <Button size="sm" variant="outline" className="gap-2 border-amber-500/50 text-amber-700 dark:text-amber-400" onClick={openTrainingDialog}>
              <GraduationCap className="h-4 w-4" /> Formation
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={handleExportCSV}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={() => setStockReportOpen(true)}>
              <FileDown className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Articles en stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock faible</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.lowStock > 0 ? 'text-warning' : ''}`}>{stats.lowStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valeur totale</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mouvements</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.totalMovements}</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Marge brute ventes stock</CardTitle>
            <ShoppingCart className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><p className={`text-2xl font-bold ${stockEconomics.soldGrossMargin >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(stockEconomics.soldGrossMargin)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Coût supports formation</CardTitle>
            <GraduationCap className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{formatCurrency(stockEconomics.trainingSupportCost)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Coût total stock consommé</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(stockEconomics.totalConsumedCost)}</p></CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        Ces indicateurs montrent la valeur economique generee ou consommee par le stock sans modifier les chiffres reels de caisse.
      </p>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contrôle de cohérence stock</CardTitle>
          <p className="text-xs text-muted-foreground">Les anciennes ventes non reliées sont ignorées; le contrôle repart des ventes du jour.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`rounded-lg border px-3 py-2 ${stockControl.missingMovementTxs.length > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-success/30 bg-success/5'}`}>
              <p className="text-xs text-muted-foreground">Ventes compta sans sortie stock</p>
              <p className="text-lg font-bold">{stockControl.missingMovementTxs.length}</p>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${stockControl.orphanSaleMovements.length > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-success/30 bg-success/5'}`}>
              <p className="text-xs text-muted-foreground">Sorties vente sans transaction</p>
              <p className="text-lg font-bold">{stockControl.orphanSaleMovements.length}</p>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${stockControl.brokenLinkedMovements.length > 0 ? 'border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20' : 'border-success/30 bg-success/5'}`}>
              <p className="text-xs text-muted-foreground">Liens stock/compta cassés</p>
              <p className="text-lg font-bold">{stockControl.brokenLinkedMovements.length}</p>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${stockControl.criticalLowItems.length > 0 ? 'border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20' : 'border-success/30 bg-success/5'}`}>
              <p className="text-xs text-muted-foreground">Stock critique (sous 50% seuil)</p>
              <p className="text-lg font-bold">{stockControl.criticalLowItems.length}</p>
            </div>
          </div>

          {(stockControl.missingMovementTxs.length > 0 || stockControl.orphanSaleMovements.length > 0 || stockControl.criticalLowItems.length > 0) && (
            <div className="space-y-2">
              {stockControl.missingMovementTxs.slice(0, 3).map((tx) => (
                <div key={tx.id} className="rounded-md border border-destructive/30 px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span>
                    <strong>Cas signalé:</strong> vente {formatCurrency(tx.amount)} ({tx.category}) sans sortie stock liée.
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => openCorrectionForMissingMovement(tx.id)}>
                      Corriger
                    </Button>
                    {tx.stockItemId && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openMovement('exit', tx.stockItemId)}>
                        Sortie manuelle
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {stockControl.orphanSaleMovements.slice(0, 3).map((mv) => (
                <div key={mv.id} className="rounded-md border border-destructive/30 px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span>
                    <strong>Cas signalé:</strong> sortie vente "{mv.reason}" sans transaction liée.
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => openCorrectionForMovement(mv.id, 'create-transaction')}>
                      Corriger
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setTab('movements'); setSearch(mv.reason); }}>
                      Vérifier
                    </Button>
                  </div>
                </div>
              ))}

              {stockControl.brokenLinkedMovements.slice(0, 3).map((mv) => (
                <div key={mv.id} className="rounded-md border border-amber-500/40 px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-amber-50/70 dark:bg-amber-950/20">
                  <span>
                    <strong>Cas signalé:</strong> lien cassé pour la sortie "{mv.reason}".
                  </span>
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => openCorrectionForMovement(mv.id, 'link-transaction')}>
                    Corriger
                  </Button>
                </div>
              ))}

              {stockControl.criticalLowItems.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-md border border-amber-500/40 px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-amber-50/70 dark:bg-amber-950/20">
                  <span>
                    <strong>Cas signalé:</strong> {item.name} à {formatQuantity(item.currentQuantity)} {item.unit} (seuil {formatQuantity(item.alertThreshold)}).
                  </span>
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => quickOpenMovementForRestock(item.id)}>
                    Enregistrer entrée
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Articles / Mouvements */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="items" className="gap-2"><Layers className="h-4 w-4" /> Articles</TabsTrigger>
            <TabsTrigger value="movements" className="gap-2"><History className="h-4 w-4" /> Mouvements</TabsTrigger>
            <TabsTrigger value="kits" className="gap-2"><Boxes className="h-4 w-4" /> Kits</TabsTrigger>
            <TabsTrigger value="trainings" className="gap-2"><GraduationCap className="h-4 w-4" /> Formations</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
            </div>
            {tab === 'items' && (
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-44">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {STOCK_CATEGORIES.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* ==================== ARTICLES TAB ==================== */}
        <TabsContent value="items" className="mt-4">
          {filteredItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Box className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">Aucun article en stock</p>
                <p className="text-sm">Cliquez sur "Nouvel article" pour commencer</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead>Unité</TableHead>
                    <TableHead className="text-right">Prix achat</TableHead>
                    <TableHead className="text-right">Prix vente</TableHead>
                    <TableHead className="text-right">Valeur</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {item.name}
                          {item.currentQuantity <= item.alertThreshold && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Bas
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getCategoryLabel(item.categoryId, departmentId)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatQuantity(item.currentQuantity)}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.purchasePrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.sellingPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.currentQuantity * item.sellingPrice)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Entrée" onClick={() => openMovement('entry', item.id)}>
                            <ArrowDownToLine className="h-4 w-4 text-success" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Sortie" onClick={() => openMovement('exit', item.id)}>
                            <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Historique" onClick={() => setHistoryItem(item)}>
                            <History className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Modifier" onClick={() => openEditItem(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Supprimer" onClick={() => setDeleteId(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ==================== MOUVEMENTS TAB ==================== */}
        <TabsContent value="movements" className="mt-4">
          {filteredMovements.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">Aucun mouvement enregistré</p>
                <p className="text-sm">Les entrées et sorties de stock apparaîtront ici</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Article</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Avant</TableHead>
                    <TableHead className="text-right">Après</TableHead>
                    <TableHead className="text-right">Prix unit.</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Par</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map(mv => {
                    const item = getItemById(mv.itemId);
                    return (
                      <TableRow key={mv.id} className={stockControl.flaggedMovementIds.has(mv.id) ? 'bg-destructive/5' : ''}>
                        <TableCell className="whitespace-nowrap">{new Date(mv.date).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="font-medium">{item?.name ?? '—'}</TableCell>
                        <TableCell>
                          {mv.type === 'entry' && <Badge className="bg-success/15 text-success border-success/30">Entrée</Badge>}
                          {mv.type === 'exit' && <Badge variant="destructive">Sortie</Badge>}
                          {mv.type === 'adjustment' && <Badge variant="secondary">Ajustement</Badge>}
                          {mv.type === 'training' && <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400">Formation</Badge>}
                          {mv.type === 'gift' && <Badge className="bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400">Don formé</Badge>}
                        </TableCell>
                        <TableCell>{mv.reason}{mv.parkName ? ` (${mv.parkName})` : ''}{mv.traineeName ? ` → ${mv.traineeName}` : ''}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {mv.type === 'entry' ? '+' : (mv.type === 'exit' || mv.type === 'training' || mv.type === 'gift') ? '-' : '='}{formatQuantity(mv.quantity)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatQuantity(mv.previousQuantity)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatQuantity(mv.newQuantity)}</TableCell>
                        <TableCell className="text-right">{mv.unitPrice > 0 ? formatCurrency(mv.unitPrice) : '—'}</TableCell>
                        <TableCell className="text-sm">
                          {mv.transactionId ? (() => {
                            const tx = transactionsById.get(mv.transactionId);
                            return tx ? (
                              <span className="text-blue-600 dark:text-blue-400" title={`${tx.description || tx.category} — ${formatCurrency(tx.amount)}`}>
                                {new Date(tx.date).toLocaleDateString('fr-FR')} — {formatCurrency(tx.amount)}
                              </span>
                            ) : <span className="text-destructive">Lien cassé</span>;
                          })() : mv.reason.toLowerCase().includes('vente') ? <span className="text-destructive">A relier</span> : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{mv.createdBy}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ==================== FORMATIONS TAB ==================== */}
        {/* ==================== KITS TAB ==================== */}
        <TabsContent value="kits" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Un kit est une composition d'articles. Vendre un kit déduit automatiquement tous les composants du stock.
            </p>
            <Button onClick={openNewKit} className="gap-2">
              <Plus className="h-4 w-4" /> Nouveau kit
            </Button>
          </div>
          {kits.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Boxes className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">Aucun kit configuré</p>
                <p className="text-sm">Créez un kit pour grouper des articles et automatiser les déductions de stock</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kits.map(kit => {
                const check = checkKitAvailability(kit.id, 1, departmentId);
                return (
                  <Card key={kit.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{kit.name}</CardTitle>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditKit(kit)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteKitId(kit.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {kit.description && <p className="text-xs text-muted-foreground">{kit.description}</p>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Composition</p>
                        {kit.components.map((comp, i) => {
                          const item = getItemById(comp.stockItemId);
                          const hasEnough = item ? item.currentQuantity >= comp.quantity : false;
                          return (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span>{item?.name ?? '—'}</span>
                              <span className={hasEnough ? 'text-muted-foreground' : 'text-destructive font-semibold'}>
                                {comp.quantity} {item?.unit ?? ''} {!hasEnough && `(dispo: ${item?.currentQuantity ?? 0})`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm font-semibold">{formatCurrency(kit.sellingPrice)}</span>
                        <Button size="sm" onClick={() => openSellKit(kit.id)} disabled={!check.available} className="gap-1 text-xs">
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {check.available ? 'Vendre ce kit' : 'Stock insuffisant'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trainings" className="mt-4">
          {trainings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">Aucune formation enregistrée</p>
                <p className="text-sm">Cliquez sur "Formation" pour enregistrer une session</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="border border-blue-200 bg-blue-50/70 shadow-none dark:border-blue-900/40 dark:bg-blue-950/20">
                <CardContent className="py-3 text-sm text-blue-800 dark:text-blue-300">
                  Retrouvez ici chaque session enregistrée avec les formés, leurs dates d'inscription, leur pack choisi et le statut de livraison des kits.
                </CardContent>
              </Card>
              {[...trainings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tr => (
                <Card key={tr.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tr.trainingType === 'guims-academy' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                          <GraduationCap className={`h-5 w-5 ${tr.trainingType === 'guims-academy' ? 'text-blue-700 dark:text-blue-400' : 'text-amber-700 dark:text-amber-400'}`} />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {tr.trainingType === 'gaba'
                              ? `Formation ${GABA_CATEGORIES.find(c => c.id === tr.gabaCategory)?.label || 'GABA'}`
                              : tr.parkName}
                            <Badge variant="outline" className={tr.trainingType === 'guims-academy' ? 'border-blue-300 text-blue-700 dark:text-blue-400' : 'border-amber-300 text-amber-700 dark:text-amber-400'}>
                              {tr.trainingType === 'guims-academy' ? 'Guims Academy' : 'GABA'}
                            </Badge>
                            {tr.tranche && <Badge variant="secondary">{tr.tranche}</Badge>}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {new Date(tr.date).toLocaleDateString('fr-FR')} · {tr.trainees.length} formé(s) · Par {tr.createdBy}
                            {tr.trainingType !== 'gaba' && tr.enrollmentDate && <> · Inscrit le {new Date(tr.enrollmentDate).toLocaleDateString('fr-FR')}</>}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTrainingId(tr.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {tr.description && <p className="text-muted-foreground">{tr.description}</p>}
                    {tr.trainingType === 'gaba' && tr.traineeKits && tr.traineeKits.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border bg-muted/30 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Kits prévus</p>
                          <p className="text-lg font-semibold">{tr.traineeKits.length}</p>
                        </div>
                        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Kits livrés</p>
                          <p className="text-lg font-semibold text-success">{tr.traineeKits.filter(kit => kit.delivered).length}</p>
                        </div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 px-3 py-2 dark:bg-amber-950/20">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reste à livrer</p>
                          <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">{tr.traineeKits.filter(kit => !kit.delivered).length}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <span className="font-medium">Formés :</span>
                      {tr.trainees.map((t, i) => <Badge key={i} variant="secondary">{t}</Badge>)}
                    </div>
                    {/* Trainee kits */}
                    {tr.traineeKits && tr.traineeKits.length > 0 && (
                      <div className="space-y-2">
                        <span className="font-medium">Livraison des kits par formé :</span>
                        <div className="space-y-2">
                          {tr.traineeKits.map((kit, i) => (
                            <div key={i} className="rounded-lg border p-3 bg-card">
                              <div className="flex flex-col gap-1 py-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">{kit.traineeName}</span>
                                  <Badge variant={kit.delivered ? 'default' : 'secondary'}>
                                    {kit.delivered ? 'Kit livré' : 'Kit non livré'}
                                  </Badge>
                                  {kit.enrollmentId && (
                                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                                      Lien inscription
                                    </Badge>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={kit.delivered ? 'outline' : 'default'}
                                    className="h-7 text-[11px]"
                                    onClick={() => handleSetKitDelivered(tr.id, kit.traineeName, !kit.delivered)}
                                  >
                                    {kit.delivered ? 'Marquer non livré' : kit.enrollmentId ? 'Marquer livré' : 'Créer inscription & livrer'}
                                  </Button>
                                </div>
                                <div className="text-muted-foreground">
                                  {kit.enrollmentDate && `inscrit le ${new Date(kit.enrollmentDate).toLocaleDateString('fr-FR')}`}
                                  {kit.selectedPackName && `${kit.enrollmentDate ? ' · ' : ''}pack ${kit.selectedPackName}`}
                                  {kit.starterKitHannetons > 0 && ` — ${kit.starterKitHannetons} hanneton(s)`}
                                  {kit.hasBook && ' — Livre ✓'}
                                  {kit.otherItems?.length > 0 && ` — ${kit.otherItems.map(oi => { const it = items.find(x => x.id === oi.itemId); return `${it?.name ?? '?'} ×${oi.quantity}`; }).join(', ')}`}
                                  {kit.delivered && kit.deliveredAt && ` · livré le ${new Date(kit.deliveredAt).toLocaleDateString('fr-FR')}`}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(!tr.traineeKits || tr.traineeKits.length === 0) && tr.trainingType === 'gaba' && (
                      <p className="text-xs text-muted-foreground">Aucune attribution de kit enregistrée pour cette session.</p>
                    )}
                    {tr.materialsUsed.length > 0 && (
                      <div>
                        <span className="font-medium">Matériels utilisés :</span>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {tr.materialsUsed.map((m, i) => {
                            const item = items.find(it => it.id === m.itemId);
                            return <li key={i}>{item?.name ?? '—'} × {m.quantity}</li>;
                          })}
                        </ul>
                      </div>
                    )}
                    {tr.kitsUsed && tr.kitsUsed.length > 0 && (
                      <div>
                        <span className="font-medium">Kits utilisés :</span>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {tr.kitsUsed.map((ku, i) => {
                            const kit = kits.find(k => k.id === ku.kitId);
                            return <li key={i}>{kit?.name ?? '—'} × {ku.quantity}</li>;
                          })}
                        </ul>
                      </div>
                    )}
                    {tr.giftsGiven.length > 0 && (
                      <div>
                        <span className="font-medium">Éléments offerts :</span>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {tr.giftsGiven.map((g, i) => {
                            const item = items.find(it => it.id === g.itemId);
                            return <li key={i}>{item?.name ?? '—'} × {g.quantity} → {g.traineeName}</li>;
                          })}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}

      {/* New / Edit item dialog */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Modifier l\'article' : 'Nouvel article'}</DialogTitle>
            <DialogDescription>
              {editItem ? 'Modifiez les informations de l\'article.' : 'Ajoutez un article au stock GABA.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom de l'article</Label>
              <Input placeholder="Ex: Poulets de chair, Provende starter..." value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={itemForm.categoryId} onValueChange={v => setItemForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STOCK_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unité</Label>
                <Select value={itemForm.unit} onValueChange={v => setItemForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Seuil d'alerte (stock bas)</Label>
                <Input type="number" min="0" step={DECIMAL_STEP} value={itemForm.alertThreshold} onChange={e => setItemForm(f => ({ ...f, alertThreshold: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Prix d'achat (FCFA)</Label>
                <Input type="number" min="0" step={DECIMAL_STEP} value={itemForm.purchasePrice} onChange={e => setItemForm(f => ({ ...f, purchasePrice: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prix de vente (FCFA)</Label>
              <Input type="number" min="0" step={DECIMAL_STEP} value={itemForm.sellingPrice} onChange={e => setItemForm(f => ({ ...f, sellingPrice: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>Annuler</Button>
            <Button onClick={handleSaveItem}>{editItem ? 'Enregistrer' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog (entry / exit / training / gift) */}
      <Dialog open={moveDialog} onOpenChange={setMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moveType === 'entry' ? 'Entrée de stock' : moveType === 'exit' ? 'Sortie de stock' : moveType === 'training' ? 'Usage formation' : moveType === 'gift' ? 'Don au formé' : 'Ajustement'}
            </DialogTitle>
            <DialogDescription>
              {moveType === 'entry' ? 'Enregistrez un achat ou une réception de marchandise.' : moveType === 'exit' ? 'Enregistrez une vente, utilisation ou perte.' : moveType === 'training' ? 'Matériel utilisé lors d\'une formation (sans valeur monétaire).' : moveType === 'gift' ? 'Élément offert à un formé (sans valeur monétaire).' : 'Corrigez la quantité en stock.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Article</Label>
              <Select value={moveItemId} onValueChange={(value) => {
                setMoveItemId(value);
                const item = items.find(i => i.id === value);
                if (moveType === 'entry' && moveForm.reason === FINANCIAL_ENTRY_REASON && (item?.purchasePrice ?? 0) > 0) {
                  setMoveForm(f => ({ ...f, unitPrice: String(item?.purchasePrice ?? 0) }));
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un article" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} ({formatQuantity(i.currentQuantity)} {i.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantité</Label>
                <Input type="number" min="0" step={DECIMAL_STEP} placeholder="0" value={moveForm.quantity} onChange={e => setMoveForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              {(moveType === 'exit' || moveType === 'adjustment' || isFinancialEntry) && (
                <div className="space-y-2">
                  <Label>Prix unitaire (FCFA)</Label>
                  <Input type="number" min="0" step={DECIMAL_STEP} placeholder="0" value={moveForm.unitPrice} onChange={e => setMoveForm(f => ({ ...f, unitPrice: e.target.value }))} />
                </div>
              )}
            </div>
            {isFinancialEntry && (
              <div className="space-y-2">
                <Label>Caisse de retrait</Label>
                <Select value={moveForm.paymentMethod} onValueChange={v => setMoveForm(f => ({ ...f, paymentMethod: v as PaymentMethod }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une caisse" /></SelectTrigger>
                  <SelectContent>
                    {getPaymentMethodsForDepartment(departmentId as DepartmentId).map(method => (
                      <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isFinancialEntry && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fournisseur *</Label>
                  <Input
                    placeholder="Nom du fournisseur"
                    value={moveForm.supplierName}
                    onChange={e => setMoveForm(f => ({ ...f, supplierName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone fournisseur</Label>
                  <Input
                    placeholder="Ex: 6XXXXXXXX"
                    value={moveForm.supplierPhone}
                    onChange={e => setMoveForm(f => ({ ...f, supplierPhone: e.target.value }))}
                  />
                </div>
              </div>
            )}
            {isFinancialEntry && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <p>
                  Montant total : <span className="font-semibold">{formatCurrency(entryTotal)}</span>
                </p>
                <p>
                  Prix de base (BD) : <span className="font-semibold">{formatCurrency(purchaseReferencePrice)}</span>
                </p>
                {hasPurchasePriceDelta && (
                  <p className={purchasePriceDelta > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
                    Écart unitaire : <span className="font-semibold">{purchasePriceDelta > 0 ? '+' : ''}{formatCurrency(purchasePriceDelta)}</span>
                  </p>
                )}
                <p className="text-muted-foreground">
                  Cette somme sera enregistrée comme dépense dans la caisse sélectionnée.
                </p>
              </div>
            )}
            {hasPurchasePriceDelta && (
              <div className="space-y-2">
                <Label>Justification de l'écart de prix *</Label>
                <Input
                  placeholder="Ex: hausse marché, promo fournisseur, transport inclus..."
                  value={moveForm.priceVarianceNote}
                  onChange={e => setMoveForm(f => ({ ...f, priceVarianceNote: e.target.value }))}
                />
              </div>
            )}
            {(moveType === 'training' || moveType === 'gift') && (
              <div className="space-y-2">
                <Label>Parc de formation</Label>
                <Input placeholder="Ex: Parc Central, Parc Nord..." value={moveForm.parkName} onChange={e => setMoveForm(f => ({ ...f, parkName: e.target.value }))} />
              </div>
            )}
            {moveType === 'gift' && (
              <div className="space-y-2">
                <Label>Nom du formé</Label>
                <Input placeholder="Nom du bénéficiaire" value={moveForm.traineeName} onChange={e => setMoveForm(f => ({ ...f, traineeName: e.target.value }))} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Motif</Label>
              <Select value={moveForm.reason} onValueChange={v => setMoveForm(f => {
                const next = { ...f, reason: v, transactionId: '' };
                if (moveType === 'entry') {
                  if (v === FINANCIAL_ENTRY_REASON) {
                    const ref = selectedMoveItem?.purchasePrice ?? 0;
                    if (ref > 0) next.unitPrice = String(ref);
                  } else {
                    next.unitPrice = '';
                    next.paymentMethod = (getPaymentMethodsForDepartment(departmentId)[0]?.value ?? 'especes') as PaymentMethod;
                    next.supplierName = '';
                    next.supplierPhone = '';
                    next.priceVarianceNote = '';
                  }
                }
                return next;
              })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(moveType === 'entry' ? ENTRY_REASONS : moveType === 'training' ? TRAINING_REASONS : moveType === 'gift' ? GIFT_REASONS : allowedExitReasons).map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {moveType === 'entry' && !isFinancialEntry && (
              <div className="rounded-lg border border-emerald-600/30 bg-emerald-50/70 p-3 text-sm text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/20 dark:text-emerald-400">
                Cette entrée est non financière ({moveForm.reason}). Aucun retrait de caisse ni transaction de dépense ne sera créé.
              </div>
            )}
            {moveType === 'exit' && !userPermissions.canRecordStockExitWithoutPrice && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 p-3 text-sm text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-400">
                Les sorties sans prix comme utilisation, perte ou don sont réservées aux utilisateurs autorisés par le Super Admin.
              </div>
            )}
            {moveType === 'exit' && moveForm.reason === 'Vente' && (() => {
              const deptTransactions = getTransactionsByDepartment(departmentId as DepartmentId)
                .filter(t => t.type === 'income')
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 50);
              return (
                <div className="space-y-2">
                  <Label>Transaction liée (optionnel)</Label>
                  <Select value={moveForm.transactionId || '__none__'} onValueChange={v => setMoveForm(f => ({ ...f, transactionId: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner une transaction" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Aucune</SelectItem>
                      {deptTransactions.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {new Date(t.date).toLocaleDateString('fr-FR')} — {t.description || t.category} — {formatCurrency(t.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={moveForm.date} onChange={e => setMoveForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            {(moveType === 'training' || moveType === 'gift') && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-400">
                💡 Les sorties formation/don sont enregistrées sans valeur monétaire.
              </div>
            )}
            {moveItemId && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">
                  Stock actuel : <span className="font-semibold text-foreground">{formatQuantity(items.find(i => i.id === moveItemId)?.currentQuantity ?? 0)} {items.find(i => i.id === moveItemId)?.unit}</span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog(false)}>Annuler</Button>
            <Button onClick={handleSaveMovement}>
              {moveType === 'entry' ? 'Enregistrer l\'entrée' : moveType === 'exit' ? 'Enregistrer la sortie' : moveType === 'training' ? 'Enregistrer l\'usage' : moveType === 'gift' ? 'Enregistrer le don' : 'Ajuster'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet article ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'article et tout son historique de mouvements seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Item history dialog */}
      <Dialog open={!!historyItem} onOpenChange={open => !open && setHistoryItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique — {historyItem?.name}</DialogTitle>
            <DialogDescription>
              Stock actuel : {formatQuantity(historyItem?.currentQuantity ?? 0)} {historyItem?.unit} · Catégorie : {historyItem ? getCategoryLabel(historyItem.categoryId, departmentId) : ''}
            </DialogDescription>
          </DialogHeader>
          {itemMovements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun mouvement pour cet article</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead className="text-right">Qté</TableHead>
                    <TableHead className="text-right">Avant</TableHead>
                    <TableHead className="text-right">Après</TableHead>
                    <TableHead>Par</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemMovements.map(mv => (
                    <TableRow key={mv.id}>
                      <TableCell className="whitespace-nowrap">{new Date(mv.date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>
                        {mv.type === 'entry' && <Badge className="bg-success/15 text-success border-success/30">Entrée</Badge>}
                        {mv.type === 'exit' && <Badge variant="destructive">Sortie</Badge>}
                        {mv.type === 'adjustment' && <Badge variant="secondary">Ajustement</Badge>}
                        {mv.type === 'training' && <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400">Formation</Badge>}
                        {mv.type === 'gift' && <Badge className="bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400">Don formé</Badge>}
                      </TableCell>
                      <TableCell>{mv.reason}{mv.parkName ? ` (${mv.parkName})` : ''}{mv.traineeName ? ` → ${mv.traineeName}` : ''}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {mv.type === 'entry' ? '+' : (mv.type === 'exit' || mv.type === 'training' || mv.type === 'gift') ? '-' : '='}{formatQuantity(mv.quantity)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatQuantity(mv.previousQuantity)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatQuantity(mv.newQuantity)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{mv.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Training session dialog */}
      <Dialog open={trainingDialog} onOpenChange={setTrainingDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enregistrer une formation</DialogTitle>
            <DialogDescription>
              Enregistrez une session de formation. La date d'inscription est capturée automatiquement par le système.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Training type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type de formation *</Label>
                <Select value={trainingForm.trainingType} onValueChange={(v: string) => setTrainingForm(f => ({ ...f, trainingType: v as TrainingType, tranche: '' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gaba">GABA (Élevage)</SelectItem>
                    <SelectItem value="guims-academy">Guims Academy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                {trainingForm.trainingType === 'gaba' ? (
                  <>
                    <Label>Catégorie de formation GABA *</Label>
                    <Select value={trainingForm.gabaCategory} onValueChange={(v: string) => setTrainingForm(f => ({ ...f, gabaCategory: v as GabaCategoryId }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GABA_CATEGORIES.map((category) => (
                          <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Label>Lieu de formation *</Label>
                    <Input placeholder="Ex: Salle A, Campus..." value={trainingForm.parkName} onChange={e => setTrainingForm(f => ({ ...f, parkName: e.target.value }))} />
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date de formation</Label>
              <Input type="date" value={trainingForm.date} onChange={e => setTrainingForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            {trainingForm.trainingType === 'guims-academy' && (
              <div className="space-y-2">
                <Label>Tranche *</Label>
                <Select value={trainingForm.tranche} onValueChange={v => setTrainingForm(f => ({ ...f, tranche: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner la tranche" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tranche 1">Tranche 1</SelectItem>
                    <SelectItem value="Tranche 2">Tranche 2</SelectItem>
                    <SelectItem value="Tranche 3">Tranche 3</SelectItem>
                    <SelectItem value="Complet">Paiement Complet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Description / notes</Label>
              <Input placeholder="Description de la formation..." value={trainingForm.description} onChange={e => setTrainingForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            {trainingForm.trainingType === 'gaba' ? (
              <div className="space-y-2">
                <Label>Apprenants (sélection depuis la base) *</Label>
                <div className="flex gap-2">
                  <Select value={gabaLearnerToAdd} onValueChange={setGabaLearnerToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Sélectionner un apprenant déjà inscrit" />
                    </SelectTrigger>
                    <SelectContent>
                      {learnerOptions.length === 0 ? (
                        <SelectItem value="__none__" disabled>Aucun apprenant inscrit dans la base</SelectItem>
                      ) : (
                        learnerOptions.map((learner) => (
                          <SelectItem key={learner.key} value={learner.key}>{learner.fullName}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => {
                    if (!gabaLearnerToAdd || gabaLearnerToAdd === '__none__') {
                      toast.error('Sélectionnez un apprenant');
                      return;
                    }
                    addLearnerToTraining(gabaLearnerToAdd);
                  }}>
                    Ajouter
                  </Button>
                </div>

                {selectedLearners.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    {selectedLearners.map((learner) => {
                      const selectedKit = trainingForm.traineeKits.find(k => k.traineeName === learner.fullName);
                      const matchingEnrollment = learner.enrollments.find(entry => entry.matchesSelectedCategory);
                      return (
                        <div key={learner.key} className="rounded-md border p-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm">{learner.fullName}</p>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLearnerFromTraining(learner.key)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          {matchingEnrollment ? (
                            <p className="text-xs text-success">
                              Inscrit le {new Date(matchingEnrollment.enrolledAt).toLocaleDateString('fr-FR')} ({matchingEnrollment.formationName})
                            </p>
                          ) : (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Cet apprenant n'est pas inscrit dans cette catégorie. Vous pouvez tout de même le garder dans la session.
                            </p>
                          )}
                          {categoryPackOptions.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                              <Label className="text-xs">Pack choisi</Label>
                              <Select
                                value={selectedKit?.selectedPackId || '__none__'}
                                onValueChange={(value) => setTraineePackSelection(learner.fullName, value)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Sélectionner un pack" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Aucun pack</SelectItem>
                                  {categoryPackOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-400">
                  Les dates d'inscription des formés sont récupérées automatiquement depuis la base dès leur sélection.
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date d'inscription *</Label>
                    <Input type="date" value={trainingForm.enrollmentDate} onChange={e => setTrainingForm(f => ({ ...f, enrollmentDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Formés (séparer par des virgules) *</Label>
                    <Input placeholder="Jean Dupont, Marie Kamga, ..." value={trainingForm.trainees} onChange={e => setTrainingForm(f => ({ ...f, trainees: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {/* Trainee kits (GABA) */}
            {trainingForm.trainingType === 'gaba' && trainingForm.traineeKits.length > 0 && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">Kits de démarrage par formé</Label>
                <div className="rounded-lg border p-3 space-y-3">
                  {trainingForm.traineeKits.map((kit, idx) => (
                    <div key={idx} className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium min-w-[120px]">{kit.traineeName}</span>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs whitespace-nowrap">Hannetons :</Label>
                        <Input className="w-20" type="number" min="0" value={kit.starterKitHannetons} onChange={e => {
                          const kits = [...trainingForm.traineeKits];
                          kits[idx].starterKitHannetons = e.target.value;
                          setTrainingForm(f => ({ ...f, traineeKits: kits }));
                        }} />
                      </div>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={kit.hasBook} onChange={e => {
                          const kits = [...trainingForm.traineeKits];
                          kits[idx].hasBook = e.target.checked;
                          setTrainingForm(f => ({ ...f, traineeKits: kits }));
                        }} className="rounded" />
                        Livre
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Materials used (GABA only) */}
            {trainingForm.trainingType === 'gaba' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Matériels utilisés (sorties sans prix)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setTrainingForm(f => ({ ...f, materials: [...f.materials, { itemId: items[0]?.id ?? '', quantity: '' }] }))}>
                    <Plus className="h-3 w-3 mr-1" /> Ajouter
                  </Button>
                </div>
                {trainingForm.materials.map((mat, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Select value={mat.itemId} onValueChange={v => { const m = [...trainingForm.materials]; m[idx].itemId = v; setTrainingForm(f => ({ ...f, materials: m })); }}>
                        <SelectTrigger><SelectValue placeholder="Article" /></SelectTrigger>
                        <SelectContent>
                          {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.currentQuantity} {i.unit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                        <Input className="w-20" type="number" min="0" step={DECIMAL_STEP} placeholder="Qté" value={mat.quantity} onChange={e => { const m = [...trainingForm.materials]; m[idx].quantity = e.target.value; setTrainingForm(f => ({ ...f, materials: m })); }} />
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTrainingForm(f => ({ ...f, materials: f.materials.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Kits used (GABA only) */}
            {trainingForm.trainingType === 'gaba' && kits.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Kits stock utilisés</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setTrainingForm(f => ({ ...f, kitUsages: [...f.kitUsages, { kitId: kits[0]?.id ?? '', quantity: '1' }] }))}>
                    <Boxes className="h-3 w-3 mr-1" /> Ajouter un kit
                  </Button>
                </div>
                {trainingForm.kitUsages.map((ku, idx) => {
                  const selectedKit = kits.find(k => k.id === ku.kitId);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Select value={ku.kitId} onValueChange={v => { const k = [...trainingForm.kitUsages]; k[idx].kitId = v; setTrainingForm(f => ({ ...f, kitUsages: k })); }}>
                            <SelectTrigger><SelectValue placeholder="Kit" /></SelectTrigger>
                            <SelectContent>
                              {kits.map(k => <SelectItem key={k.id} value={k.id}>{k.name} ({formatCurrency(k.sellingPrice)})</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input className="w-20" type="number" min="1" placeholder="Qté" value={ku.quantity} onChange={e => { const k = [...trainingForm.kitUsages]; k[idx].quantity = e.target.value; setTrainingForm(f => ({ ...f, kitUsages: k })); }} />
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTrainingForm(f => ({ ...f, kitUsages: f.kitUsages.filter((_, i) => i !== idx) }))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      {selectedKit && (
                        <p className="text-xs text-muted-foreground ml-1">
                          Composants : {selectedKit.components.map(c => { const it = items.find(i => i.id === c.stockItemId); return `${it?.name ?? '?'} ×${c.quantity}`; }).join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
                {trainingForm.kitUsages.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun kit ajouté. Cliquez "Ajouter un kit" pour utiliser un kit stock dans cette formation.</p>
                )}
              </div>
            )}

            {/* Gifts given (GABA only) */}
            {trainingForm.trainingType === 'gaba' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Autres éléments offerts aux formés</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setTrainingForm(f => ({ ...f, gifts: [...f.gifts, { traineeName: '', itemId: items[0]?.id ?? '', quantity: '' }] }))}>
                    <Gift className="h-3 w-3 mr-1" /> Ajouter
                  </Button>
                </div>
                {trainingForm.gifts.map((gift, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="w-44">
                      <Select value={gift.traineeName || '__none__'} onValueChange={v => {
                        const g = [...trainingForm.gifts];
                        g[idx].traineeName = v === '__none__' ? '' : v;
                        setTrainingForm(f => ({ ...f, gifts: g }));
                      }}>
                        <SelectTrigger><SelectValue placeholder="Formé" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sélectionner</SelectItem>
                          {selectedLearners.map((learner) => (
                            <SelectItem key={learner.key} value={learner.fullName}>{learner.fullName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Select value={gift.itemId} onValueChange={v => { const g = [...trainingForm.gifts]; g[idx].itemId = v; setTrainingForm(f => ({ ...f, gifts: g })); }}>
                        <SelectTrigger><SelectValue placeholder="Article" /></SelectTrigger>
                        <SelectContent>
                          {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.currentQuantity} {i.unit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="w-20" type="number" min="0" step={DECIMAL_STEP} placeholder="Qté" value={gift.quantity} onChange={e => { const g = [...trainingForm.gifts]; g[idx].quantity = e.target.value; setTrainingForm(f => ({ ...f, gifts: g })); }} />
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTrainingForm(f => ({ ...f, gifts: f.gifts.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {trainingForm.gifts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun élément offert. Cliquez "Ajouter" si des formés repartent avec des éléments.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrainingDialog(false)}>Annuler</Button>
            <Button onClick={handleSaveTraining}>Enregistrer la formation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete training confirmation */}
      <AlertDialog open={!!deleteTrainingId} onOpenChange={open => !open && setDeleteTrainingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette formation ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'enregistrement de la formation sera supprimé. Les mouvements de stock associés resteront dans l'historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTraining} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportDialog
        open={stockReportOpen}
        onOpenChange={setStockReportOpen}
        title={`Rapport de stock — ${departmentId === 'gaba' ? 'GABA' : 'Guims Academy'}`}
        onGenerate={async (opts) => { await downloadStockReport(opts, departmentId); toast.success('Rapport généré'); }}
      />

      {/* New / Edit Kit dialog */}
      <Dialog open={kitDialog} onOpenChange={setKitDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editKit ? 'Modifier le kit' : 'Nouveau kit'}</DialogTitle>
            <DialogDescription>
              Un kit est une composition d'articles du stock. Quand vous vendez un kit, chaque composant est déduit automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom du kit</Label>
              <Input placeholder="Ex: Kit Hanneton, Kit de démarrage avicole..." value={kitForm.name} onChange={e => setKitForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Détails du kit..." value={kitForm.description} onChange={e => setKitForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Prix de vente du kit (FCFA)</Label>
              <Input type="number" min="0" step={DECIMAL_STEP} placeholder="Ex: 25000" value={kitForm.sellingPrice} onChange={e => setKitForm(f => ({ ...f, sellingPrice: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Composants</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setKitForm(f => ({ ...f, components: [...f.components, { stockItemId: items[0]?.id ?? '', quantity: '1' }] }))}>
                  <Plus className="h-3 w-3 mr-1" /> Ajouter
                </Button>
              </div>
              {kitForm.components.map((comp, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select value={comp.stockItemId} onValueChange={v => { const c = [...kitForm.components]; c[idx].stockItemId = v; setKitForm(f => ({ ...f, components: c })); }}>
                      <SelectTrigger><SelectValue placeholder="Article" /></SelectTrigger>
                      <SelectContent>
                        {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.currentQuantity} {i.unit})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input className="w-24" type="number" min="0" step={DECIMAL_STEP} placeholder="Qté" value={comp.quantity} onChange={e => { const c = [...kitForm.components]; c[idx].quantity = e.target.value; setKitForm(f => ({ ...f, components: c })); }} />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setKitForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {kitForm.components.length === 0 && (
                <p className="text-sm text-muted-foreground">Ajoutez des articles qui composent ce kit.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKitDialog(false)}>Annuler</Button>
            <Button onClick={handleSaveKit}>{editKit ? 'Modifier' : 'Créer le kit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell Kit dialog */}
      <Dialog open={sellKitDialog} onOpenChange={setSellKitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vendre un kit</DialogTitle>
            <DialogDescription>
              {sellKitId && (() => {
                const kit = kits.find(k => k.id === sellKitId);
                if (!kit) return null;
                const qty = parseInt(sellKitForm.quantity) || 1;
                return (
                  <span className="block mt-1">
                    <strong>{kit.name}</strong> — {kit.components.map(c => {
                      const item = getItemById(c.stockItemId);
                      return `${item?.name ?? '?'} ×${c.quantity}`;
                    }).join(', ')}
                    <br />
                    <span className="text-primary font-semibold">Total: {formatCurrency(kit.sellingPrice * qty)}</span>
                  </span>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantité de kits</Label>
                <Input type="number" min="1" value={sellKitForm.quantity} onChange={e => setSellKitForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={sellKitForm.date} onChange={e => setSellKitForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du client</Label>
                <Input placeholder="Ex: Jean Dupont" value={sellKitForm.clientName} onChange={e => setSellKitForm(f => ({ ...f, clientName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone (optionnel)</Label>
                <Input placeholder="Ex: 6 99 00 00 00" value={sellKitForm.phoneNumber} onChange={e => setSellKitForm(f => ({ ...f, phoneNumber: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Moyen de paiement</Label>
              <Select value={sellKitForm.paymentMethod} onValueChange={v => setSellKitForm(f => ({ ...f, paymentMethod: v as PaymentMethod }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getPaymentMethodsForDepartment(departmentId).map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description (optionnel)</Label>
              <Input placeholder="Note ou détail de la vente" value={sellKitForm.description} onChange={e => setSellKitForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            {sellKitId && (() => {
              const qty = parseInt(sellKitForm.quantity) || 1;
              const check = checkKitAvailability(sellKitId, qty, departmentId);
              if (!check.available) return (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-xs text-red-700 dark:text-red-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Stock insuffisant pour {qty} kit{qty > 1 ? 's' : ''}
                  </p>
                  <ul className="mt-1 text-xs text-red-600 dark:text-red-300 list-disc list-inside">
                    {check.missing.map((m, i) => <li key={i}>{m.itemName}: besoin {m.required}, dispo {m.available}</li>)}
                  </ul>
                </div>
              );
              const kit = kits.find(k => k.id === sellKitId);
              if (kit) return (
                <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                  <p className="text-xs text-green-700 dark:text-green-400 font-semibold">
                    ✅ Stock disponible — une transaction de {formatCurrency(kit.sellingPrice * qty)} sera automatiquement enregistrée
                  </p>
                </div>
              );
              return null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellKitDialog(false)}>Annuler</Button>
            <Button onClick={handleSellKit}>Confirmer la vente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctionDialog} onOpenChange={setCorrectionDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Corriger ce cas stock</DialogTitle>
            <DialogDescription>
              {correctionTarget?.kind === 'missing-movement' && 'Étape 1: choisir l\'article et générer la sortie stock manquante à partir de la transaction.'}
              {correctionTarget?.kind === 'orphan-movement' && 'Étape 1: soit créer la transaction manquante, soit rattacher ce mouvement à une transaction existante.'}
              {correctionTarget?.kind === 'broken-movement' && 'Étape 1: rebrancher ce mouvement sur une transaction valide ou en recréer une automatiquement.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {correctionTarget?.kind !== 'missing-movement' && (
              <div className="space-y-2">
                <Label>Action de correction</Label>
                <Select value={correctionMode} onValueChange={(value) => setCorrectionMode(value as StockCorrectionMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link-transaction">Lier à une transaction existante</SelectItem>
                    <SelectItem value="create-transaction">Créer la transaction manquante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {correctionMode === 'create-movement' && (
              <>
                <div className="space-y-2">
                  <Label>Article à sortir</Label>
                  <Select value={correctionForm.itemId} onValueChange={(value) => setCorrectionForm(form => ({ ...form, itemId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un article" /></SelectTrigger>
                    <SelectContent>
                      {items.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({formatQuantity(item.currentQuantity)} {item.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantité</Label>
                    <Input type="number" min="0" step={DECIMAL_STEP} value={correctionForm.quantity} onChange={e => setCorrectionForm(form => ({ ...form, quantity: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Prix unitaire</Label>
                    <Input type="number" min="0" step={DECIMAL_STEP} value={correctionForm.unitPrice} onChange={e => setCorrectionForm(form => ({ ...form, unitPrice: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Motif</Label>
                    <Input value={correctionForm.reason} onChange={e => setCorrectionForm(form => ({ ...form, reason: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={correctionForm.date} onChange={e => setCorrectionForm(form => ({ ...form, date: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {correctionMode === 'link-transaction' && (
              <div className="space-y-2">
                <Label>Transaction de vente</Label>
                <Select value={correctionForm.transactionId || '__none__'} onValueChange={value => setCorrectionForm(form => ({ ...form, transactionId: value === '__none__' ? '' : value }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une transaction" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune</SelectItem>
                    {incomeTransactions.map(tx => (
                      <SelectItem key={tx.id} value={tx.id}>
                        {new Date(tx.date).toLocaleDateString('fr-FR')} — {tx.description || tx.category} — {formatCurrency(tx.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {correctionMode === 'create-transaction' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Montant</Label>
                    <Input type="number" min="0" step={DECIMAL_STEP} value={correctionForm.amount} onChange={e => setCorrectionForm(form => ({ ...form, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Moyen de paiement</Label>
                    <Select value={correctionForm.paymentMethod} onValueChange={(value) => setCorrectionForm(form => ({ ...form, paymentMethod: value as PaymentMethod }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getPaymentMethodsForDepartment(departmentId).map(method => (
                          <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Input value={correctionForm.personName} onChange={e => setCorrectionForm(form => ({ ...form, personName: e.target.value }))} placeholder="Nom du client" />
                  </div>
                  <div className="space-y-2">
                    <Label>Téléphone</Label>
                    <Input value={correctionForm.phoneNumber} onChange={e => setCorrectionForm(form => ({ ...form, phoneNumber: e.target.value }))} placeholder="Optionnel" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={correctionForm.description} onChange={e => setCorrectionForm(form => ({ ...form, description: e.target.value }))} placeholder="Libellé de la vente" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={correctionForm.date} onChange={e => setCorrectionForm(form => ({ ...form, date: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {correctionTarget?.kind !== 'missing-movement' && correctionTarget?.movementId && (() => {
              const movement = movements.find(entry => entry.id === correctionTarget.movementId);
              const item = movement ? items.find(entry => entry.id === movement.itemId) : undefined;
              if (!movement) return null;
              return (
                <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Mouvement ciblé: {item?.name ?? 'Article'} · {formatQuantity(movement.quantity)} {item?.unit ?? ''} · {movement.reason}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionDialog(false)}>Annuler</Button>
            <Button onClick={handleApplyCorrection}>Corriger</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Kit confirmation */}
      <AlertDialog open={!!deleteKitId} onOpenChange={open => !open && setDeleteKitId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce kit ?</AlertDialogTitle>
            <AlertDialogDescription>
              La configuration du kit sera supprimée. Le stock actuel ne sera pas modifié.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteKit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
