import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, Plus, ArrowDownToLine, ArrowUpFromLine, BarChart3, AlertTriangle,
  Pencil, Trash2, History, Search, Download, SlidersHorizontal, ArrowLeft,
  Box, Layers, FileDown,
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
import {
  STOCK_CATEGORIES, getStockItems, addStockItem, updateStockItem, deleteStockItem,
  addStockMovement, getStockMovements, getStockStats, getCategoryLabel,
  exportStockCSV, type StockItem, type StockMovement, type MovementType,
} from "@/lib/stock";
import logoGaba from "@/assets/logo-gaba.png";

const UNITS = ['pièce', 'kg', 'sac', 'litre', 'carton', 'boîte', 'dose', 'lot'];

const ENTRY_REASONS = ['Achat', 'Don reçu', 'Production', 'Retour', 'Autre'];
const EXIT_REASONS = ['Vente', 'Utilisation', 'Perte/Mortalité', 'Don', 'Autre'];

export default function GabaStockPage() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  // --- Access check ---
  if (!hasDepartmentAccess(user, 'gaba')) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Vous n'avez pas accès au stock GABA</p>
        <p className="text-sm">Contactez le Super Admin pour obtenir l'accès.</p>
      </div>
    );
  }

  // --- Data ---
  const [items, setItems] = useState<StockItem[]>(getStockItems);
  const [movements, setMovements] = useState<StockMovement[]>(getStockMovements);
  const stats = useMemo(() => getStockStats(), [items, movements]);

  const refresh = () => {
    setItems(getStockItems());
    setMovements(getStockMovements());
  };

  // --- Filters ---
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [tab, setTab] = useState('items');

  // --- Item dialog ---
  const [itemDialog, setItemDialog] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', categoryId: 'geniteurs', unit: 'pièce', alertThreshold: '5', unitPrice: '0' });

  // --- Movement dialog ---
  const [moveDialog, setMoveDialog] = useState(false);
  const [moveType, setMoveType] = useState<MovementType>('entry');
  const [moveItemId, setMoveItemId] = useState('');
  const [moveForm, setMoveForm] = useState({ quantity: '', unitPrice: '', reason: '', date: new Date().toISOString().slice(0, 10) });

  // --- Delete dialog ---
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // --- Item history dialog ---
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);

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

  // ==================== HANDLERS ====================

  const openNewItem = () => {
    setEditItem(null);
    setItemForm({ name: '', categoryId: 'geniteurs', unit: 'pièce', alertThreshold: '5', unitPrice: '0' });
    setItemDialog(true);
  };

  const openEditItem = (item: StockItem) => {
    setEditItem(item);
    setItemForm({
      name: item.name,
      categoryId: item.categoryId,
      unit: item.unit,
      alertThreshold: String(item.alertThreshold),
      unitPrice: String(item.unitPrice),
    });
    setItemDialog(true);
  };

  const handleSaveItem = () => {
    if (!itemForm.name.trim()) { toast.error('Nom de l\'article requis'); return; }
    const threshold = parseInt(itemForm.alertThreshold, 10);
    const price = parseInt(itemForm.unitPrice, 10);
    if (isNaN(threshold) || threshold < 0) { toast.error('Seuil d\'alerte invalide'); return; }
    if (isNaN(price) || price < 0) { toast.error('Prix unitaire invalide'); return; }

    if (editItem) {
      updateStockItem(editItem.id, {
        name: itemForm.name.trim(),
        categoryId: itemForm.categoryId,
        unit: itemForm.unit,
        alertThreshold: threshold,
        unitPrice: price,
      });
      toast.success('Article modifié');
    } else {
      addStockItem({
        name: itemForm.name.trim(),
        categoryId: itemForm.categoryId,
        unit: itemForm.unit,
        alertThreshold: threshold,
        unitPrice: price,
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
    setMoveForm({ quantity: '', unitPrice: '', reason: type === 'entry' ? ENTRY_REASONS[0] : EXIT_REASONS[0], date: new Date().toISOString().slice(0, 10) });
    setMoveDialog(true);
  };

  const handleSaveMovement = () => {
    const qty = parseInt(moveForm.quantity, 10);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantité invalide'); return; }
    const price = parseInt(moveForm.unitPrice, 10) || 0;
    if (!moveForm.reason.trim()) { toast.error('Motif requis'); return; }

    const result = addStockMovement(
      moveItemId,
      moveType,
      qty,
      price,
      moveForm.reason.trim(),
      moveForm.date,
      user?.displayName ?? 'Inconnu',
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(moveType === 'entry' ? 'Entrée enregistrée' : moveType === 'exit' ? 'Sortie enregistrée' : 'Ajustement enregistré');
    setMoveDialog(false);
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

  const getItemById = (id: string) => items.find(i => i.id === id);

  const itemMovements = useMemo(() => {
    if (!historyItem) return [];
    return movements
      .filter(m => m.itemId === historyItem.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [historyItem, movements]);

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
            <Button size="sm" variant="ghost" className="gap-2" onClick={handleExportCSV}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={() => { downloadStockReport(); toast.success('Rapport PDF téléchargé'); }}>
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
                    <TableHead className="text-right">Prix unit.</TableHead>
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
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.currentQuantity * item.unitPrice)}</TableCell>
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
                        </TableCell>
                        <TableCell>{mv.reason}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {mv.type === 'entry' ? '+' : mv.type === 'exit' ? '-' : '='}{mv.quantity}
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
                <Label>Prix unitaire (FCFA)</Label>
                <Input type="number" min="0" value={itemForm.unitPrice} onChange={e => setItemForm(f => ({ ...f, unitPrice: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>Annuler</Button>
            <Button onClick={handleSaveItem}>{editItem ? 'Enregistrer' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog (entry / exit) */}
      <Dialog open={moveDialog} onOpenChange={setMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moveType === 'entry' ? 'Entrée de stock' : moveType === 'exit' ? 'Sortie de stock' : 'Ajustement'}
            </DialogTitle>
            <DialogDescription>
              {moveType === 'entry' ? 'Enregistrez un achat ou une réception de marchandise.' : moveType === 'exit' ? 'Enregistrez une vente, utilisation ou perte.' : 'Corrigez la quantité en stock.'}
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
              <div className="space-y-2">
                <Label>Prix unitaire (FCFA)</Label>
                <Input type="number" min="0" placeholder="0" value={moveForm.unitPrice} onChange={e => setMoveForm(f => ({ ...f, unitPrice: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Motif</Label>
              <Select value={moveForm.reason} onValueChange={v => setMoveForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(moveType === 'entry' ? ENTRY_REASONS : EXIT_REASONS).map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={moveForm.date} onChange={e => setMoveForm(f => ({ ...f, date: e.target.value }))} />
            </div>
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
              {moveType === 'entry' ? 'Enregistrer l\'entrée' : moveType === 'exit' ? 'Enregistrer la sortie' : 'Ajuster'}
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
                      </TableCell>
                      <TableCell>{mv.reason}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {mv.type === 'entry' ? '+' : mv.type === 'exit' ? '-' : '='}{mv.quantity}
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
    </div>
  );
}
