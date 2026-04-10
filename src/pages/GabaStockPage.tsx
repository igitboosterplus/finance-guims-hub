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
import { getCurrentUser, hasDepartmentAccess } from "@/lib/auth";
import { formatCurrency } from "@/lib/data";
import { downloadStockReport } from "@/lib/reports";
import type { ReportOptions } from "@/lib/reports";
import { ReportDialog } from "@/components/ReportDialog";
import {
  STOCK_CATEGORIES, getStockItems, addStockItem, updateStockItem, deleteStockItem,
  addStockMovement, getStockMovements, getStockStats, getCategoryLabel,
  exportStockCSV, getTrainings, addTraining, deleteTraining, getMovementTypeLabel,
  getStockKits, addStockKit, updateStockKit, deleteStockKit, checkKitAvailability, sellKit, useKitForTraining,
  type StockItem, type StockMovement, type MovementType, type Training, type TrainingType, type TraineeKit,
  type StockKit, type KitComponent, type TrainingKitUsage,
} from "@/lib/stock";
import logoGaba from "@/assets/logo-gaba.png";

const UNITS = ['pièce', 'kg', 'sac', 'litre', 'carton', 'boîte', 'dose', 'lot'];

const ENTRY_REASONS = ['Achat', 'Don reçu', 'Production', 'Retour', 'Autre'];
const EXIT_REASONS = ['Vente', 'Utilisation', 'Perte/Mortalité', 'Don', 'Autre'];
const TRAINING_REASONS = ['Usage formation', 'Substrat formation', 'Démonstration', 'Autre'];
const GIFT_REASONS = ['Don au formé', 'Kit de démarrage', 'Échantillon', 'Autre'];

export default function GabaStockPage() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  // --- Data ---
  const [items, setItems] = useState<StockItem[]>(getStockItems);
  const [movements, setMovements] = useState<StockMovement[]>(getStockMovements);
  const [trainings, setTrainings] = useState<Training[]>(getTrainings);
  const [kits, setKits] = useState<StockKit[]>(getStockKits);
  const stats = useMemo(() => getStockStats(), []);

  const refresh = () => {
    setItems(getStockItems());
    setMovements(getStockMovements());
    setTrainings(getTrainings());
    setKits(getStockKits());
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
  const [moveForm, setMoveForm] = useState({ quantity: '', unitPrice: '', reason: '', date: new Date().toISOString().slice(0, 10), parkName: '', traineeName: '' });

  // --- Training dialog ---
  const [trainingDialog, setTrainingDialog] = useState(false);
  const [trainingForm, setTrainingForm] = useState({
    trainingType: 'gaba' as TrainingType,
    parkName: '', date: new Date().toISOString().slice(0, 10), enrollmentDate: new Date().toISOString().slice(0, 10), description: '',
    trainees: '' as string, // comma-separated
    tranche: '' as string, // Guims Academy
    materials: [] as { itemId: string; quantity: string }[],
    gifts: [] as { traineeName: string; itemId: string; quantity: string }[],
    traineeKits: [] as { traineeName: string; starterKitHannetons: string; hasBook: boolean; }[],
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
  const [sellKitForm, setSellKitForm] = useState({ quantity: '1', date: new Date().toISOString().slice(0, 10), clientName: '' });
  const [deleteKitId, setDeleteKitId] = useState<string | null>(null);

  // ==================== FILTERED DATA ====================

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterCategory !== 'all') result = result.filter(i => i.categoryId === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || getCategoryLabel(i.categoryId).toLowerCase().includes(q));
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

  // --- Access check (after all hooks) ---
  if (!hasDepartmentAccess(user, 'gaba')) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Vous n'avez pas accès au stock GABA</p>
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
    const threshold = parseInt(itemForm.alertThreshold, 10);
    const pPrice = parseInt(itemForm.purchasePrice, 10);
    const sPrice = parseInt(itemForm.sellingPrice, 10);
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
      });
      toast.success('Article modifié');
    } else {
      addStockItem({
        name: itemForm.name.trim(),
        categoryId: itemForm.categoryId,
        unit: itemForm.unit,
        alertThreshold: threshold,
        purchasePrice: pPrice,
        sellingPrice: sPrice,
      });
      toast.success('Article ajouté au stock');
    }
    setItemDialog(false);
    refresh();
  };

  const handleDeleteItem = () => {
    if (!deleteId) return;
    deleteStockItem(deleteId);
    toast.success('Article supprimé');
    setDeleteId(null);
    refresh();
  };

  const openMovement = (type: MovementType, itemId?: string) => {
    setMoveType(type);
    setMoveItemId(itemId ?? (items.length > 0 ? items[0].id : ''));
    const defaultReason = type === 'entry' ? ENTRY_REASONS[0] : type === 'training' ? TRAINING_REASONS[0] : type === 'gift' ? GIFT_REASONS[0] : EXIT_REASONS[0];
    setMoveForm({ quantity: '', unitPrice: '', reason: defaultReason, date: new Date().toISOString().slice(0, 10), parkName: '', traineeName: '' });
    setMoveDialog(true);
  };

  const handleSaveMovement = () => {
    const qty = parseInt(moveForm.quantity, 10);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantité invalide'); return; }
    const price = (moveType === 'training' || moveType === 'gift') ? 0 : (parseInt(moveForm.unitPrice, 10) || 0);
    if (!moveForm.reason.trim()) { toast.error('Motif requis'); return; }
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
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const labels: Record<MovementType, string> = { entry: 'Entrée enregistrée', exit: 'Sortie enregistrée', adjustment: 'Ajustement enregistré', training: 'Usage formation enregistré', gift: 'Don au formé enregistré' };
    toast.success(labels[moveType]);
    setMoveDialog(false);
    refresh();
  };

  // --- Training session handler ---
  const openTrainingDialog = () => {
    setTrainingForm({
      trainingType: 'gaba',
      parkName: '', date: new Date().toISOString().slice(0, 10), description: '',
      trainees: '', tranche: '',
      materials: [{ itemId: items[0]?.id ?? '', quantity: '' }],
      gifts: [],
      traineeKits: [],
      kitUsages: [],
      enrollmentDate: new Date().toISOString().slice(0, 10),
    });
    setTrainingDialog(true);
  };

  const handleSaveTraining = () => {
    if (!trainingForm.parkName.trim()) { toast.error('Nom du parc / lieu requis'); return; }
    const traineeList = trainingForm.trainees.split(',').map(t => t.trim()).filter(Boolean);
    if (traineeList.length === 0) { toast.error('Au moins un formé requis'); return; }
    if (trainingForm.trainingType === 'guims-academy' && !trainingForm.tranche) { toast.error('Veuillez sélectionner une tranche'); return; }

    const userName = user?.displayName ?? 'Inconnu';
    const errors: string[] = [];

    // Record material usage movements (GABA only)
    if (trainingForm.trainingType === 'gaba') {
      for (const mat of trainingForm.materials) {
        const qty = parseInt(mat.quantity, 10);
        if (!mat.itemId || isNaN(qty) || qty <= 0) continue;
        const item = items.find(i => i.id === mat.itemId);
        const result = addStockMovement(mat.itemId, 'training', qty, 0, 'Usage formation', trainingForm.date, userName, trainingForm.parkName.trim());
        if (!result.success) errors.push(`${item?.name}: ${result.error}`);
      }

      // Record gifts movements
      for (const gift of trainingForm.gifts) {
        const qty = parseInt(gift.quantity, 10);
        if (!gift.itemId || isNaN(qty) || qty <= 0 || !gift.traineeName.trim()) continue;
        const item = items.find(i => i.id === gift.itemId);
        const result = addStockMovement(gift.itemId, 'gift', qty, 0, `Don à ${gift.traineeName.trim()}`, trainingForm.date, userName, trainingForm.parkName.trim(), gift.traineeName.trim());
        if (!result.success) errors.push(`${item?.name} → ${gift.traineeName}: ${result.error}`);
      }

      // Record kit usages
      for (const ku of trainingForm.kitUsages) {
        const qty = parseInt(ku.quantity, 10);
        if (!ku.kitId || isNaN(qty) || qty <= 0) continue;
        const kit = kits.find(k => k.id === ku.kitId);
        const result = useKitForTraining(ku.kitId, qty, trainingForm.date, userName, trainingForm.parkName.trim());
        if (!result.success) errors.push(`Kit ${kit?.name}: ${result.error}`);
      }
    }

    // Build trainee kits
    const traineeKits: TraineeKit[] = trainingForm.traineeKits
      .filter(k => k.traineeName.trim())
      .map(k => ({
        traineeName: k.traineeName.trim(),
        starterKitHannetons: parseInt(k.starterKitHannetons, 10) || 0,
        hasBook: k.hasBook,
        otherItems: trainingForm.gifts.filter(g => g.traineeName.trim() === k.traineeName.trim()).map(g => ({
          traineeName: g.traineeName.trim(),
          itemId: g.itemId,
          quantity: parseInt(g.quantity, 10) || 0,
        })),
      }));

    // Save training record
    addTraining({
      trainingType: trainingForm.trainingType,
      parkName: trainingForm.parkName.trim(),
      date: trainingForm.date,
      enrollmentDate: trainingForm.enrollmentDate ? new Date(trainingForm.enrollmentDate).toISOString() : new Date().toISOString(),
      description: trainingForm.description.trim(),
      trainees: traineeList,
      traineeKits,
      materialsUsed: trainingForm.materials.filter(m => m.itemId && parseInt(m.quantity, 10) > 0).map(m => ({ itemId: m.itemId, quantity: parseInt(m.quantity, 10) })),
      giftsGiven: trainingForm.gifts.filter(g => g.itemId && parseInt(g.quantity, 10) > 0 && g.traineeName.trim()).map(g => ({ traineeName: g.traineeName.trim(), itemId: g.itemId, quantity: parseInt(g.quantity, 10) })),
      kitsUsed: trainingForm.kitUsages.filter(ku => ku.kitId && parseInt(ku.quantity, 10) > 0).map(ku => ({ kitId: ku.kitId, quantity: parseInt(ku.quantity, 10) })),
      ...(trainingForm.trainingType === 'guims-academy' ? { tranche: trainingForm.tranche } : {}),
      createdBy: userName,
    });

    if (errors.length > 0) {
      toast.error(`Formation enregistrée avec ${errors.length} erreur(s): ${errors[0]}`);
    } else {
      toast.success('Formation enregistrée avec succès');
    }
    setTrainingDialog(false);
    refresh();
  };

  const handleDeleteTraining = () => {
    if (!deleteTrainingId) return;
    deleteTraining(deleteTrainingId);
    toast.success('Formation supprimée');
    setDeleteTrainingId(null);
    refresh();
  };

  const handleExportCSV = () => {
    const csv = exportStockCSV();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-gaba-${new Date().toISOString().slice(0, 10)}.csv`;
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
    const price = parseInt(kitForm.sellingPrice);
    if (isNaN(price) || price < 0) { toast.error('Prix de vente invalide'); return; }
    const components: KitComponent[] = kitForm.components
      .filter(c => c.stockItemId && parseInt(c.quantity) > 0)
      .map(c => ({ stockItemId: c.stockItemId, quantity: parseInt(c.quantity) }));
    if (components.length === 0) { toast.error('Ajoutez au moins un composant'); return; }

    if (editKit) {
      updateStockKit(editKit.id, { name: kitForm.name.trim(), description: kitForm.description.trim(), sellingPrice: price, components });
      toast.success('Kit modifié');
    } else {
      addStockKit({ name: kitForm.name.trim(), description: kitForm.description.trim(), sellingPrice: price, components, createdBy: user?.displayName ?? 'Inconnu' });
      toast.success('Kit créé');
    }
    setKitDialog(false);
    refresh();
  };

  const handleDeleteKit = () => {
    if (!deleteKitId) return;
    deleteStockKit(deleteKitId);
    toast.success('Kit supprimé');
    setDeleteKitId(null);
    refresh();
  };

  const openSellKit = (kitId: string) => {
    setSellKitId(kitId);
    setSellKitForm({ quantity: '1', date: new Date().toISOString().slice(0, 10), clientName: '' });
    setSellKitDialog(true);
  };

  const handleSellKit = () => {
    if (!sellKitId) return;
    const qty = parseInt(sellKitForm.quantity);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantité invalide'); return; }
    const result = sellKit(sellKitId, qty, sellKitForm.date, user?.displayName ?? 'Inconnu', sellKitForm.clientName.trim() || undefined);
    if (!result.success) { toast.error(result.error ?? 'Erreur'); return; }
    toast.success(`Kit vendu — ${result.movements?.length ?? 0} déduction(s) automatiques`);
    setSellKitDialog(false);
    refresh();
  };

  const getItemById = (id: string) => items.find(i => i.id === id);

  // ==================== RENDER ====================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-dept-gaba-light p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/department/gaba')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logoGaba} alt="GABA" className="h-14 w-14 rounded-2xl object-cover shadow-md bg-card" />
            <div>
              <h2 className="text-2xl font-bold text-foreground">Gestion des Stocks — GABA</h2>
              <p className="text-sm text-muted-foreground">Géniteurs, intrants, équipements & produits finis</p>
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
                        <Badge variant="secondary">{getCategoryLabel(item.categoryId)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{item.currentQuantity}</TableCell>
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
                    <TableHead>Par</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map(mv => {
                    const item = getItemById(mv.itemId);
                    return (
                      <TableRow key={mv.id}>
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
                          {mv.type === 'entry' ? '+' : (mv.type === 'exit' || mv.type === 'training' || mv.type === 'gift') ? '-' : '='}{mv.quantity}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{mv.previousQuantity}</TableCell>
                        <TableCell className="text-right font-semibold">{mv.newQuantity}</TableCell>
                        <TableCell className="text-right">{mv.unitPrice > 0 ? formatCurrency(mv.unitPrice) : '—'}</TableCell>
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
                const check = checkKitAvailability(kit.id);
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
                            {tr.parkName}
                            <Badge variant="outline" className={tr.trainingType === 'guims-academy' ? 'border-blue-300 text-blue-700 dark:text-blue-400' : 'border-amber-300 text-amber-700 dark:text-amber-400'}>
                              {tr.trainingType === 'guims-academy' ? 'Guims Academy' : 'GABA'}
                            </Badge>
                            {tr.tranche && <Badge variant="secondary">{tr.tranche}</Badge>}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {new Date(tr.date).toLocaleDateString('fr-FR')} · {tr.trainees.length} formé(s) · Par {tr.createdBy}
                            {tr.enrollmentDate && <> · Inscrit le {new Date(tr.enrollmentDate).toLocaleDateString('fr-FR')}</>}
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
                    <div className="flex flex-wrap gap-1">
                      <span className="font-medium">Formés :</span>
                      {tr.trainees.map((t, i) => <Badge key={i} variant="secondary">{t}</Badge>)}
                    </div>
                    {/* Trainee kits */}
                    {tr.traineeKits && tr.traineeKits.length > 0 && (
                      <div>
                        <span className="font-medium">Kits de démarrage :</span>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {tr.traineeKits.map((kit, i) => (
                            <li key={i}>
                              <span className="font-medium text-foreground">{kit.traineeName}</span>
                              {kit.starterKitHannetons > 0 && ` — ${kit.starterKitHannetons} hanneton(s)`}
                              {kit.hasBook && ' — Livre ✓'}
                              {kit.otherItems?.length > 0 && ` — ${kit.otherItems.map(oi => { const it = items.find(x => x.id === oi.itemId); return `${it?.name ?? '?'} ×${oi.quantity}`; }).join(', ')}`}
                            </li>
                          ))}
                        </ul>
                      </div>
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
                <Input type="number" min="0" value={itemForm.alertThreshold} onChange={e => setItemForm(f => ({ ...f, alertThreshold: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Prix d'achat (FCFA)</Label>
                <Input type="number" min="0" value={itemForm.purchasePrice} onChange={e => setItemForm(f => ({ ...f, purchasePrice: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prix de vente (FCFA)</Label>
              <Input type="number" min="0" value={itemForm.sellingPrice} onChange={e => setItemForm(f => ({ ...f, sellingPrice: e.target.value }))} />
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
              <Select value={moveItemId} onValueChange={setMoveItemId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un article" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} ({i.currentQuantity} {i.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantité</Label>
                <Input type="number" min="1" placeholder="0" value={moveForm.quantity} onChange={e => setMoveForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              {moveType !== 'training' && moveType !== 'gift' && (
                <div className="space-y-2">
                  <Label>Prix unitaire (FCFA)</Label>
                  <Input type="number" min="0" placeholder="0" value={moveForm.unitPrice} onChange={e => setMoveForm(f => ({ ...f, unitPrice: e.target.value }))} />
                </div>
              )}
            </div>
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
              <Select value={moveForm.reason} onValueChange={v => setMoveForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(moveType === 'entry' ? ENTRY_REASONS : moveType === 'training' ? TRAINING_REASONS : moveType === 'gift' ? GIFT_REASONS : EXIT_REASONS).map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                  Stock actuel : <span className="font-semibold text-foreground">{items.find(i => i.id === moveItemId)?.currentQuantity ?? 0} {items.find(i => i.id === moveItemId)?.unit}</span>
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
              Stock actuel : {historyItem?.currentQuantity} {historyItem?.unit} · Catégorie : {historyItem ? getCategoryLabel(historyItem.categoryId) : ''}
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
                        {mv.type === 'entry' ? '+' : (mv.type === 'exit' || mv.type === 'training' || mv.type === 'gift') ? '-' : '='}{mv.quantity}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{mv.previousQuantity}</TableCell>
                      <TableCell className="text-right font-semibold">{mv.newQuantity}</TableCell>
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
                <Label>{trainingForm.trainingType === 'gaba' ? 'Parc de formation *' : 'Lieu de formation *'}</Label>
                <Input placeholder={trainingForm.trainingType === 'gaba' ? 'Ex: Parc Central, Parc Nord...' : 'Ex: Salle A, Campus...'} value={trainingForm.parkName} onChange={e => setTrainingForm(f => ({ ...f, parkName: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date de formation</Label>
                <Input type="date" value={trainingForm.date} onChange={e => setTrainingForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Date d'inscription *</Label>
                <Input type="date" value={trainingForm.enrollmentDate} onChange={e => setTrainingForm(f => ({ ...f, enrollmentDate: e.target.value }))} />
              </div>
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
            <div className="space-y-2">
              <Label>Formés (séparer par des virgules) *</Label>
              <Input placeholder="Jean Dupont, Marie Kamga, ..." value={trainingForm.trainees} onChange={e => {
                const names = e.target.value;
                setTrainingForm(f => ({ ...f, trainees: names }));
              }} />
              {trainingForm.trainees && (
                <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => {
                  const nameList = trainingForm.trainees.split(',').map(n => n.trim()).filter(Boolean);
                  setTrainingForm(f => ({
                    ...f,
                    traineeKits: nameList.map(name => {
                      const existing = f.traineeKits.find(k => k.traineeName === name);
                      return existing ?? { traineeName: name, starterKitHannetons: '0', hasBook: false };
                    }),
                  }));
                }}>
                  Générer les kits pour chaque formé
                </Button>
              )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-400">
              📋 La date d'inscription est définie ci-dessus. Par défaut c'est la date du jour ({new Date().toLocaleDateString('fr-FR')}).
            </div>

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
                    <Input className="w-20" type="number" min="1" placeholder="Qté" value={mat.quantity} onChange={e => { const m = [...trainingForm.materials]; m[idx].quantity = e.target.value; setTrainingForm(f => ({ ...f, materials: m })); }} />
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
                    <Input className="w-36" placeholder="Nom du formé" value={gift.traineeName} onChange={e => { const g = [...trainingForm.gifts]; g[idx].traineeName = e.target.value; setTrainingForm(f => ({ ...f, gifts: g })); }} />
                    <div className="flex-1">
                      <Select value={gift.itemId} onValueChange={v => { const g = [...trainingForm.gifts]; g[idx].itemId = v; setTrainingForm(f => ({ ...f, gifts: g })); }}>
                        <SelectTrigger><SelectValue placeholder="Article" /></SelectTrigger>
                        <SelectContent>
                          {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.currentQuantity} {i.unit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="w-20" type="number" min="1" placeholder="Qté" value={gift.quantity} onChange={e => { const g = [...trainingForm.gifts]; g[idx].quantity = e.target.value; setTrainingForm(f => ({ ...f, gifts: g })); }} />
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
        title="Rapport de stock — GABA"
        onGenerate={(opts) => { downloadStockReport(opts); toast.success('Rapport PDF téléchargé'); }}
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
              <Input type="number" min="0" placeholder="Ex: 25000" value={kitForm.sellingPrice} onChange={e => setKitForm(f => ({ ...f, sellingPrice: e.target.value }))} />
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
                  <Input className="w-24" type="number" min="1" placeholder="Qté" value={comp.quantity} onChange={e => { const c = [...kitForm.components]; c[idx].quantity = e.target.value; setKitForm(f => ({ ...f, components: c })); }} />
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
                return (
                  <span className="block mt-1">
                    <strong>{kit.name}</strong> — {kit.components.map(c => {
                      const item = getItemById(c.stockItemId);
                      return `${item?.name ?? '?'} ×${c.quantity}`;
                    }).join(', ')}
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
            <div className="space-y-2">
              <Label>Nom du client (optionnel)</Label>
              <Input placeholder="Ex: Jean Dupont" value={sellKitForm.clientName} onChange={e => setSellKitForm(f => ({ ...f, clientName: e.target.value }))} />
            </div>
            {sellKitId && (() => {
              const qty = parseInt(sellKitForm.quantity) || 1;
              const check = checkKitAvailability(sellKitId, qty);
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
              return null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellKitDialog(false)}>Annuler</Button>
            <Button onClick={handleSellKit}>Confirmer la vente</Button>
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
