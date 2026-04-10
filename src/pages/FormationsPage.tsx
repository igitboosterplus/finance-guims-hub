import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { departments, type DepartmentId, formatCurrency } from "@/lib/data";
import { getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import {
  getFormationsCatalog, addFormationCatalog, updateFormationCatalog, deleteFormationCatalog,
  getStockItems, getStockKits,
  type FormationCatalog, type FormationPack, type FormationTranche, type PackAdvantage, type PackKitItem, type PackKitReference, type StockItem, type StockKit,
} from "@/lib/stock";
import { toast } from "sonner";
import {
  GraduationCap, Plus, Pencil, Trash2, Package, Star, Award, ChevronDown, ChevronUp, Search, Calendar, CreditCard, Boxes,
} from "lucide-react";

// ==================== PACK EDITOR COMPONENT ====================

interface PackEditorProps {
  pack: FormationPack;
  stockItems: StockItem[];
  stockKits: StockKit[];
  onChange: (pack: FormationPack) => void;
  onRemove: () => void;
  index: number;
}

function PackEditor({ pack, stockItems, stockKits, onChange, onRemove, index }: PackEditorProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const [kitQuantity, setKitQuantity] = useState<string>("1");
  const [kitPriceMode, setKitPriceMode] = useState<'free' | 'reduced'>('free');
  const [kitReducedPrice, setKitReducedPrice] = useState<string>("");

  const handleAddFullKit = () => {
    const kit = stockKits.find(k => k.id === selectedKitId);
    if (!kit) { toast.error("Sélectionnez un kit"); return; }
    const qty = parseInt(kitQuantity, 10) || 1;
    const newRef: PackKitReference = {
      kitId: kit.id,
      quantity: qty,
      priceMode: kitPriceMode,
      ...(kitPriceMode === 'reduced' ? { reducedPrice: parseInt(kitReducedPrice, 10) || 0 } : {}),
    };
    onChange({ ...pack, kits: [...(pack.kits || []), newRef] });
    toast.success(`Kit "${kit.name}" ×${qty} ajouté`);
    setSelectedKitId("");
    setKitQuantity("1");
    setKitPriceMode('free');
    setKitReducedPrice("");
  };

  const removeKit = (i: number) => {
    onChange({ ...pack, kits: (pack.kits || []).filter((_, idx) => idx !== i) });
  };

  const updateAdvantage = (i: number, description: string) => {
    const advantages = [...pack.advantages];
    advantages[i] = { description };
    onChange({ ...pack, advantages });
  };

  const addAdvantage = () => {
    onChange({ ...pack, advantages: [...pack.advantages, { description: "" }] });
  };

  const removeAdvantage = (i: number) => {
    onChange({ ...pack, advantages: pack.advantages.filter((_, idx) => idx !== i) });
  };

  const addKitItem = () => {
    onChange({
      ...pack,
      kitItems: [...pack.kitItems, { stockItemId: "", label: "", quantity: 1, specialPrice: undefined, normalPrice: undefined }],
    });
  };

  const updateKitItem = (i: number, updates: Partial<PackKitItem>) => {
    const kitItems = [...pack.kitItems];
    kitItems[i] = { ...kitItems[i], ...updates };
    // Auto-fill label from stock item
    if (updates.stockItemId) {
      const item = stockItems.find(s => s.id === updates.stockItemId);
      if (item) {
        kitItems[i].label = kitItems[i].label || item.name;
        kitItems[i].normalPrice = kitItems[i].normalPrice || item.sellingPrice;
      }
    }
    onChange({ ...pack, kitItems });
  };

  const removeKitItem = (i: number) => {
    onChange({ ...pack, kitItems: pack.kitItems.filter((_, idx) => idx !== i) });
  };

  const packColors = ['bg-blue-100 dark:bg-blue-900/30 border-blue-300', 'bg-amber-100 dark:bg-amber-900/30 border-amber-300', 'bg-purple-100 dark:bg-purple-900/30 border-purple-300'];
  const colorClass = packColors[index % packColors.length];

  return (
    <div className={`rounded-lg border p-4 space-y-4 ${colorClass}`}>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 font-semibold text-sm">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {pack.name || `Pack ${index + 1}`}
          {pack.price > 0 && (
            <Badge variant="secondary" className="ml-2">{formatCurrency(pack.price)}</Badge>
          )}
        </button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nom du pack *</Label>
              <Input
                placeholder="Ex: Pack Universel, Pack Gold..."
                value={pack.name}
                onChange={(e) => onChange({ ...pack, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prix du pack (FCFA) *</Label>
              <Input
                type="number"
                min="0"
                placeholder="Ex: 25000"
                value={pack.price || ""}
                onChange={(e) => onChange({ ...pack, price: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Advantages */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1"><Star className="h-3 w-3" /> Avantages du pack</Label>
            {pack.advantages.map((adv, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Ex: Formation complète en élevage..."
                  value={adv.description}
                  onChange={(e) => updateAdvantage(i, e.target.value)}
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" onClick={() => removeAdvantage(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addAdvantage} className="gap-1 text-xs">
              <Plus className="h-3 w-3" /> Ajouter un avantage
            </Button>
          </div>

          {/* Kit Items (linked to stock) */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" /> Éléments du kit (liés au stock)</Label>
            {pack.kitItems.map((kit, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end rounded-md border bg-background/50 p-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Article du stock</Label>
                  <Select value={kit.stockItemId} onValueChange={(v) => updateKitItem(i, { stockItemId: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Lier au stock..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Pas de liaison —</SelectItem>
                      {stockItems.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.currentQuantity} {s.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Libellé *</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ex: Kit de démarrage"
                    value={kit.label}
                    onChange={(e) => updateKitItem(i, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Qté</Label>
                  <Input
                    className="h-8 text-xs w-16"
                    type="number"
                    min="1"
                    value={kit.quantity}
                    onChange={(e) => updateKitItem(i, { quantity: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Prix spécial</Label>
                  <Input
                    className="h-8 text-xs w-24"
                    type="number"
                    min="0"
                    placeholder="Gratuit"
                    value={kit.specialPrice ?? ""}
                    onChange={(e) => updateKitItem(i, { specialPrice: e.target.value ? parseInt(e.target.value) : undefined })}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeKitItem(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addKitItem} className="gap-1 text-xs">
              <Plus className="h-3 w-3" /> Ajouter un élément de kit
            </Button>
            {stockKits.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-xs flex items-center gap-1"><Boxes className="h-3 w-3" /> Kits complets du stock (optionnel)</Label>

                {/* Already added kits */}
                {(pack.kits || []).map((ref, i) => {
                  const kit = stockKits.find(k => k.id === ref.kitId);
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-md border bg-green-50 dark:bg-green-900/20 p-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold">{kit?.name ?? 'Kit inconnu'} ×{ref.quantity}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          {ref.priceMode === 'free' ? '(Gratuit)' : `(${formatCurrency(ref.reducedPrice ?? 0)})`}
                        </span>
                        {kit && (
                          <p className="text-[10px] text-muted-foreground">
                            {kit.components.map(c => { const it = stockItems.find(s => s.id === c.stockItemId); return `${it?.name ?? '?'} ×${c.quantity * ref.quantity}`; }).join(', ')}
                          </p>
                        )}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeKit(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}

                {/* Add new kit */}
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-[180px] space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Kit</Label>
                    <Select value={selectedKitId} onValueChange={setSelectedKitId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Sélectionner un kit..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stockKits.map(k => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.name} — {k.components.length} composant(s) ({formatCurrency(k.sellingPrice)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Nombre</Label>
                    <Input
                      className="h-8 text-xs w-16"
                      type="number"
                      min="1"
                      value={kitQuantity}
                      onChange={(e) => setKitQuantity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 min-w-[130px]">
                    <Label className="text-[10px] text-muted-foreground">Prix</Label>
                    <Select value={kitPriceMode} onValueChange={(v: string) => setKitPriceMode(v as 'free' | 'reduced')}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Gratuit</SelectItem>
                        <SelectItem value="reduced">Prix réduit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {kitPriceMode === 'reduced' && (
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Prix réduit (FCFA)</Label>
                      <Input
                        className="h-8 text-xs w-24"
                        type="number"
                        min="0"
                        placeholder="Ex: 5000"
                        value={kitReducedPrice}
                        onChange={(e) => setKitReducedPrice(e.target.value)}
                      />
                    </div>
                  )}
                  <Button type="button" variant="default" size="sm" className="h-8 gap-1 text-xs" onClick={handleAddFullKit}>
                    <Plus className="h-3 w-3" /> Ajouter
                  </Button>
                </div>
                {selectedKitId && (() => {
                  const kit = stockKits.find(k => k.id === selectedKitId);
                  if (!kit) return null;
                  const qty = parseInt(kitQuantity, 10) || 1;
                  return (
                    <p className="text-[10px] text-muted-foreground">
                      Composants : {kit.components.map(c => { const it = stockItems.find(s => s.id === c.stockItemId); return `${it?.name ?? '?'} ×${c.quantity * qty}`; }).join(', ')}
                      {kitPriceMode === 'free' ? ' — Gratuit' : kitReducedPrice ? ` — ${formatCurrency(parseInt(kitReducedPrice, 10) || 0)}` : ''}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function FormationsPage() {
  const currentUser = getCurrentUser();
  const canEdit = hasPermission(currentUser, 'canEditTransaction');
  const canCreate = hasPermission(currentUser, 'canCreateTransaction');

  const [formations, setFormations] = useState<FormationCatalog[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockKits, setStockKits] = useState<StockKit[]>([]);
  const [filterDept, setFilterDept] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedFormation, setExpandedFormation] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDept, setFormDept] = useState<string>("");
  const [formMode, setFormMode] = useState<'packs' | 'tranches'>('packs');
  const [formPacks, setFormPacks] = useState<FormationPack[]>([]);
  const [formTranches, setFormTranches] = useState<FormationTranche[]>([]);
  const [formTotalPrice, setFormTotalPrice] = useState<number>(0);
  const [formInscriptionFee, setFormInscriptionFee] = useState<number>(0);

  const accessibleDepts = departments.filter(d => hasDepartmentAccess(currentUser, d.id));

  useEffect(() => {
    refresh();
  }, []);

  const refresh = () => {
    setFormations(getFormationsCatalog());
    setStockItems(getStockItems());
    setStockKits(getStockKits());
  };

  const filtered = formations.filter(f => {
    if (filterDept !== "all" && f.departmentId !== filterDept) return false;
    if (search) {
      const q = search.toLowerCase();
      return f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.packs.some(p => p.name.toLowerCase().includes(q)) ||
        (f.tranches || []).some(t => t.name.toLowerCase().includes(q));
    }
    return true;
  });

  const newEmptyPack = (): FormationPack => ({
    id: crypto.randomUUID(),
    name: "",
    price: 0,
    advantages: [{ description: "" }],
    kitItems: [],
    kits: [],
  });

  const newEmptyTranche = (index: number): FormationTranche => ({
    id: crypto.randomUUID(),
    name: `Tranche ${index}`,
    amount: 0,
    deadline: "",
  });

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormDept(accessibleDepts[0]?.id || "");
    setFormMode('packs');
    setFormPacks([newEmptyPack()]);
    setFormTranches([newEmptyTranche(1), newEmptyTranche(2), newEmptyTranche(3)]);
    setFormTotalPrice(0);
    setFormInscriptionFee(0);
    setDialogOpen(true);
  };

  const openEdit = (f: FormationCatalog) => {
    setEditingId(f.id);
    setFormName(f.name);
    setFormDescription(f.description);
    setFormDept(f.departmentId);
    setFormMode(f.mode || 'packs');
    setFormPacks(f.packs.map(p => ({ ...p, advantages: [...p.advantages], kitItems: [...p.kitItems], kits: [...(p.kits || [])] })));
    setFormTranches((f.tranches || []).map(t => ({ ...t })));
    setFormTotalPrice(f.totalPrice || 0);
    setFormInscriptionFee(f.inscriptionFee || 0);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) { toast.error("Nom de la formation obligatoire"); return; }
    if (!formDept) { toast.error("Département obligatoire"); return; }

    if (formMode === 'packs') {
      if (formPacks.length === 0) { toast.error("Ajoutez au moins un pack"); return; }
      for (const p of formPacks) {
        if (!p.name.trim()) { toast.error(`Le nom du pack est obligatoire`); return; }
        if (p.price <= 0) { toast.error(`Le prix du pack "${p.name}" doit être positif`); return; }
      }
    } else {
      if (formTranches.length === 0) { toast.error("Ajoutez au moins une tranche"); return; }
      for (const t of formTranches) {
        if (!t.name.trim()) { toast.error("Le nom de la tranche est obligatoire"); return; }
        if (t.amount <= 0) { toast.error(`Le montant de "${t.name}" doit être positif`); return; }
        if (!t.deadline) { toast.error(`La date limite de "${t.name}" est obligatoire`); return; }
      }
      if (formTotalPrice <= 0) { toast.error("Le prix total (paiement complet) doit être positif"); return; }
    }

    // Deep copy packs to ensure kits and all nested data are preserved
    const packsCopy = formMode === 'packs' ? formPacks.map(p => ({
      ...p,
      advantages: [...p.advantages],
      kitItems: [...p.kitItems],
      kits: [...(p.kits || [])],
    })) : [];

    const payload = {
      name: formName.trim(),
      description: formDescription.trim(),
      departmentId: formDept as DepartmentId,
      mode: formMode,
      packs: packsCopy,
      tranches: formMode === 'tranches' ? formTranches : undefined,
      totalPrice: formMode === 'tranches' ? formTotalPrice : undefined,
      inscriptionFee: formInscriptionFee > 0 ? formInscriptionFee : undefined,
    };

    if (editingId) {
      updateFormationCatalog(editingId, payload);
      toast.success("Formation mise à jour");
    } else {
      addFormationCatalog({
        ...payload,
        createdBy: currentUser?.displayName ?? "Inconnu",
      });
      toast.success("Formation créée");
    }
    setDialogOpen(false);
    refresh();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteFormationCatalog(deleteId);
    toast.success("Formation supprimée");
    setDeleteId(null);
    refresh();
  };

  const updatePack = (index: number, pack: FormationPack) => {
    setFormPacks(prev => prev.map((p, i) => i === index ? pack : p));
  };

  const removePack = (index: number) => {
    setFormPacks(prev => prev.filter((_, i) => i !== index));
  };

  const updateTranche = (index: number, updates: Partial<FormationTranche>) => {
    const tranches = [...formTranches];
    tranches[index] = { ...tranches[index], ...updates };
    setFormTranches(tranches);
  };

  const removeTranche = (index: number) => {
    setFormTranches(formTranches.filter((_, i) => i !== index));
  };

  const getStockItemName = (id: string) => stockItems.find(s => s.id === id)?.name ?? "";
  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
            Catalogue des formations
          </h2>
          <p className="text-sm text-muted-foreground">{formations.length} formation{formations.length > 1 ? 's' : ''} configurée{formations.length > 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            Nouvelle formation
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une formation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les départements</SelectItem>
            {accessibleDepts.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Formation cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Aucune formation</p>
          <p className="text-sm">{search ? "Essayez une autre recherche" : "Créez votre première formation avec ses packs"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(f => {
            const dept = departments.find(d => d.id === f.departmentId);
            const isExpanded = expandedFormation === f.id;
            return (
              <Card key={f.id} className="border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {dept && <img src={dept.logo} alt={dept.name} className="h-10 w-10 rounded-xl object-cover shadow-sm shrink-0" />}
                      <div className="min-w-0">
                        <CardTitle className="text-base sm:text-lg truncate">{f.name}</CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{getDeptName(f.departmentId)}</Badge>
                          {(f.mode || 'packs') === 'packs' ? (
                            <Badge variant="outline" className="text-[10px]">{f.packs.length} pack{f.packs.length > 1 ? 's' : ''}</Badge>
                          ) : (
                            <>
                              <Badge variant="outline" className="text-[10px]">{(f.tranches || []).length} tranche{(f.tranches || []).length > 1 ? 's' : ''}</Badge>
                              {f.totalPrice && <Badge className="text-[10px]">Total: {formatCurrency(f.totalPrice)}</Badge>}
                            </>
                          )}
                        </div>
                        {f.description && <p className="text-xs text-muted-foreground mt-1">{f.description}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedFormation(isExpanded ? null : f.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(f)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {currentUser?.role === 'superadmin' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(f.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Pack / Tranche preview */}
                <CardContent className="pt-0">
                  {(f.mode || 'packs') === 'packs' ? (
                    <>
                      <div className={`grid grid-cols-1 ${f.packs.length >= 3 ? 'md:grid-cols-3' : f.packs.length === 2 ? 'md:grid-cols-2' : ''} gap-3`}>
                        {f.packs.map((pack, pi) => {
                          const packColors = ['border-blue-200 bg-blue-50 dark:bg-blue-950/30', 'border-amber-200 bg-amber-50 dark:bg-amber-950/30', 'border-purple-200 bg-purple-50 dark:bg-purple-950/30'];
                          const icons = [Award, Star, Award];
                          const IconComp = icons[pi % icons.length];
                          return (
                            <div key={pack.id} className={`rounded-lg border p-3 space-y-2 ${packColors[pi % packColors.length]}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <IconComp className="h-4 w-4 text-primary" />
                                  <span className="font-semibold text-sm">{pack.name}</span>
                                  {pack.kits && pack.kits.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] gap-0.5"><Boxes className="h-2.5 w-2.5" />{pack.kits.reduce((s, r) => s + r.quantity, 0)} kit(s)</Badge>
                                  )}
                                </div>
                                <Badge className="text-xs">{formatCurrency(pack.price)}</Badge>
                              </div>

                              {/* Kits complets — toujours visible */}
                              {pack.kits && pack.kits.length > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kits complets</p>
                                  {pack.kits.map((ref, ki) => {
                                    const kit = stockKits.find(k => k.id === ref.kitId);
                                    return (
                                      <div key={ki} className="rounded border bg-background/60 p-1.5 space-y-0.5">
                                        <div className="text-xs flex items-center justify-between">
                                          <span className="flex items-center gap-1 font-semibold">
                                            <Boxes className="h-3 w-3 text-primary" />
                                            {kit?.name ?? 'Kit supprimé'}
                                            {ref.quantity > 1 && <span className="text-muted-foreground">×{ref.quantity}</span>}
                                          </span>
                                          <span className="font-semibold text-success">
                                            {ref.priceMode === 'free' ? 'Gratuit' : formatCurrency(ref.reducedPrice ?? 0)}
                                          </span>
                                        </div>
                                        {kit && (
                                          <div className="text-[10px] text-muted-foreground pl-4">
                                            {kit.components.map((c, ci) => {
                                              const it = stockItems.find(s => s.id === c.stockItemId);
                                              return <span key={ci}>{ci > 0 && ' · '}{it?.name ?? '?'} ×{c.quantity * ref.quantity}</span>;
                                            })}
                                          </div>
                                        )}
                                        {ref.priceMode === 'reduced' && kit && kit.sellingPrice > 0 && (
                                          <div className="text-[10px] text-muted-foreground pl-4">
                                            <span className="line-through">{formatCurrency(kit.sellingPrice * ref.quantity)}</span> → {formatCurrency(ref.reducedPrice ?? 0)}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {isExpanded && (
                                <>
                                  {pack.advantages.length > 0 && (
                                    <ul className="space-y-1">
                                      {pack.advantages.filter(a => a.description).map((a, ai) => (
                                        <li key={ai} className="text-xs text-foreground flex items-start gap-1.5">
                                          <span className="text-success mt-0.5">✓</span>
                                          {a.description}
                                        </li>
                                      ))}
                                    </ul>
                                  )}

                                  {pack.kitItems.length > 0 && (
                                    <>
                                      <Separator className="my-1" />
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Éléments du kit</p>
                                        {pack.kitItems.map((kit, ki) => (
                                          <div key={ki} className="text-xs flex items-center justify-between gap-1">
                                            <span className="flex items-center gap-1">
                                              <Package className="h-3 w-3 text-muted-foreground" />
                                              {kit.label || getStockItemName(kit.stockItemId)}
                                              {kit.quantity > 1 && <span className="text-muted-foreground">×{kit.quantity}</span>}
                                            </span>
                                            {kit.specialPrice !== undefined && kit.normalPrice ? (
                                              <span>
                                                <span className="line-through text-muted-foreground">{formatCurrency(kit.normalPrice)}</span>
                                                {' '}
                                                <span className="font-semibold text-success">{kit.specialPrice === 0 ? 'Gratuit' : formatCurrency(kit.specialPrice)}</span>
                                              </span>
                                            ) : kit.specialPrice === undefined ? null : (
                                              <span className="font-semibold text-success">Gratuit</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {!isExpanded && f.packs.some(p => p.advantages.length > 0 || p.kitItems.length > 0 || (p.kits && p.kits.length > 0)) && (
                        <button
                          onClick={() => setExpandedFormation(f.id)}
                          className="text-xs text-primary mt-2 hover:underline"
                        >
                          Voir les détails des packs →
                        </button>
                      )}
                      {f.inscriptionFee && f.inscriptionFee > 0 && (
                        <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center justify-between mt-3">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <CreditCard className="h-4 w-4" />
                            Frais d'inscription (hors formation)
                          </span>
                          <Badge variant="outline" className="text-sm border-amber-400 text-amber-700 dark:text-amber-400">{formatCurrency(f.inscriptionFee)}</Badge>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Tranche mode display */
                    <div className="space-y-3">
                      <div className={`grid grid-cols-1 ${(f.tranches || []).length >= 3 ? 'md:grid-cols-3' : (f.tranches || []).length === 2 ? 'md:grid-cols-2' : ''} gap-3`}>
                        {(f.tranches || []).map((tranche, ti) => {
                          const trancheColors = ['border-green-200 bg-green-50 dark:bg-green-950/30', 'border-orange-200 bg-orange-50 dark:bg-orange-950/30', 'border-red-200 bg-red-50 dark:bg-red-950/30'];
                          const isOverdue = tranche.deadline && new Date(tranche.deadline) < new Date();
                          return (
                            <div key={tranche.id} className={`rounded-lg border p-3 space-y-1.5 ${trancheColors[ti % trancheColors.length]}`}>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-semibold text-sm">
                                  <CreditCard className="h-4 w-4 text-primary" />
                                  {tranche.name}
                                </span>
                                <Badge className="text-xs">{formatCurrency(tranche.amount)}</Badge>
                              </div>
                              {tranche.deadline && (
                                <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                  <Calendar className="h-3 w-3" />
                                  Date limite : {new Date(tranche.deadline).toLocaleDateString('fr-FR')}
                                  {isOverdue && ' (dépassée)'}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {f.totalPrice && (
                        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <CreditCard className="h-4 w-4" />
                            Paiement complet
                          </span>
                          <Badge variant="default" className="text-sm">{formatCurrency(f.totalPrice)}</Badge>
                        </div>
                      )}
                      {f.inscriptionFee && f.inscriptionFee > 0 && (
                        <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <CreditCard className="h-4 w-4" />
                            Frais d'inscription (hors formation)
                          </span>
                          <Badge variant="outline" className="text-sm border-amber-400 text-amber-700 dark:text-amber-400">{formatCurrency(f.inscriptionFee)}</Badge>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier la formation" : "Nouvelle formation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom de la formation *</Label>
                <Input
                  placeholder="Ex: Formation Hanneton"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Département *</Label>
                <Select value={formDept} onValueChange={setFormDept}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un département" />
                  </SelectTrigger>
                  <SelectContent>
                    {accessibleDepts.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        <div className="flex items-center gap-2">
                          <img src={d.logo} alt={d.name} className="h-4 w-4 rounded object-cover" />
                          {d.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Description de la formation..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                maxLength={500}
              />
            </div>

            {/* Mode selector */}
            <div className="space-y-2">
              <Label>Mode de tarification *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormMode('packs')}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${formMode === 'packs' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40'}`}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Award className="h-4 w-4" />
                    Packs / Formules
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Formules avec avantages et kits (ex: Pack Universel, Pack Gold)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('tranches')}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${formMode === 'tranches' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40'}`}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <CreditCard className="h-4 w-4" />
                    Tranches
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Paiement par tranches avec dates limites (ex: Tranche 1/2/3)</p>
                </button>
              </div>
            </div>

            <Separator />

            {formMode === 'packs' ? (
              /* ===== PACK EDITOR ===== */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Packs / Formules</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFormPacks([...formPacks, newEmptyPack()])} className="gap-1">
                    <Plus className="h-3 w-3" /> Ajouter un pack
                  </Button>
                </div>
                {formPacks.map((pack, i) => (
                  <PackEditor
                    key={pack.id}
                    pack={pack}
                    stockItems={stockItems}
                    stockKits={stockKits}
                    onChange={(p) => updatePack(i, p)}
                    onRemove={() => removePack(i)}
                    index={i}
                  />
                ))}
                {formPacks.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucun pack. Cliquez sur "Ajouter un pack" pour commencer.</p>
                )}

                {/* Frais d'inscription (packs mode) */}
                <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold">
                    <CreditCard className="h-4 w-4" />
                    Frais d'inscription (hors formation)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 10000"
                    value={formInscriptionFee || ""}
                    onChange={(e) => setFormInscriptionFee(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">Montant de l'inscription, non inclus dans le prix du pack. Laissez vide si pas de frais d'inscription.</p>
                </div>
              </div>
            ) : (
              /* ===== TRANCHE EDITOR ===== */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Tranches de paiement</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFormTranches([...formTranches, newEmptyTranche(formTranches.length + 1)])} className="gap-1">
                    <Plus className="h-3 w-3" /> Ajouter une tranche
                  </Button>
                </div>

                {/* Prix total (paiement complet) */}
                <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold">
                    <CreditCard className="h-4 w-4" />
                    Prix total (paiement complet) *
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 150000"
                    value={formTotalPrice || ""}
                    onChange={(e) => setFormTotalPrice(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">Montant pour le paiement en une seule fois (option "Complet")</p>
                </div>

                <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold">
                    <CreditCard className="h-4 w-4" />
                    Frais d'inscription (hors formation)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 10000"
                    value={formInscriptionFee || ""}
                    onChange={(e) => setFormInscriptionFee(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">Montant de l'inscription, non inclus dans le prix de la formation. Laissez vide si pas de frais d'inscription.</p>
                </div>

                {formTranches.map((tranche, i) => {
                  const trancheColors = ['bg-green-50 dark:bg-green-900/20 border-green-300', 'bg-orange-50 dark:bg-orange-900/20 border-orange-300', 'bg-red-50 dark:bg-red-900/20 border-red-300'];
                  return (
                    <div key={tranche.id} className={`rounded-lg border p-4 space-y-3 ${trancheColors[i % trancheColors.length]}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm flex items-center gap-1.5">
                          <CreditCard className="h-4 w-4" />
                          {tranche.name || `Tranche ${i + 1}`}
                        </span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeTranche(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Nom *</Label>
                          <Input
                            placeholder="Ex: Tranche 1"
                            value={tranche.name}
                            onChange={(e) => updateTranche(i, { name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Montant (FCFA) *</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="Ex: 50000"
                            value={tranche.amount || ""}
                            onChange={(e) => updateTranche(i, { amount: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Date limite *</Label>
                          <Input
                            type="date"
                            value={tranche.deadline}
                            onChange={(e) => updateTranche(i, { deadline: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {formTranches.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucune tranche. Cliquez sur "Ajouter une tranche" pour commencer.</p>
                )}
                {formTranches.length > 0 && (
                  <p className="text-xs text-muted-foreground text-right">
                    Total tranches : <span className="font-semibold">{formatCurrency(formTranches.reduce((s, t) => s + t.amount, 0))}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave}>{editingId ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette formation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La formation et tous ses packs seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
