import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { departments, addTransaction, PAYMENT_METHODS, isEnrollmentCategory, isTranche, getFormationsForDepartment, type DepartmentId, type PaymentMethod, type FormationOption } from "@/lib/data";
import { addAuditEntry, getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import { getStockItems, getStockByCategory, addStockMovement, type StockItem } from "@/lib/stock";
import { toast } from "sonner";
import { ArrowLeft, ShieldAlert, Package, GraduationCap, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function NewTransaction() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedDept = searchParams.get('dept') || '';
  const currentUser = getCurrentUser();
  const canCreate = hasPermission(currentUser, 'canCreateTransaction');
  const accessibleDepts = departments.filter(d => hasDepartmentAccess(currentUser, d.id));

  const [departmentId, setDepartmentId] = useState<string>(preselectedDept);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('especes');
  const [category, setCategory] = useState('');
  const [personName, setPersonName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState('');
  const [stockItemId, setStockItemId] = useState('');
  const [formationName, setFormationName] = useState('');
  const [desiredTrainingDate, setDesiredTrainingDate] = useState('');
  const [selectedKitElements, setSelectedKitElements] = useState<string[]>([]);

  const selectedDept = departments.find(d => d.id === departmentId);
  const categories = selectedDept
    ? type === 'income' ? selectedDept.incomeCategories : selectedDept.expenseCategories
    : [];

  // GABA categories that involve stock movements
  const STOCK_CATEGORIES_MAP: Record<string, 'entry' | 'exit'> = {
    'Achat composants intrants': 'entry',
    'Achat géniteurs': 'entry',
    'Vente intrants': 'exit',
    'Vente géniteurs': 'exit',
  };
  const isStockCategory = departmentId === 'gaba' && category in STOCK_CATEGORIES_MAP;
  const stockDirection = isStockCategory ? STOCK_CATEGORIES_MAP[category] : null;
  const availableStockItems: StockItem[] = isStockCategory ? getStockItems() : [];

  // Formation enrollment
  const isEnrollment = isEnrollmentCategory(category);
  const availableFormations = departmentId ? getFormationsForDepartment(departmentId as DepartmentId) : [];
  const selectedFormation = availableFormations.find(f => f.name === formationName);

  const handleFormationChange = (name: string) => {
    setFormationName(name);
    const formation = availableFormations.find(f => f.name === name);
    setSelectedKitElements(formation ? [...formation.kitElements] : []);
  };

  const toggleKitElement = (element: string) => {
    setSelectedKitElements(prev =>
      prev.includes(element) ? prev.filter(e => e !== element) : [...prev, element]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId || !category || !amount || !date) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    if (!personName.trim()) {
      toast.error("Veuillez saisir le nom de la personne");
      return;
    }

    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Le montant doit être un nombre positif");
      return;
    }

    // Stock validation for GABA stock categories
    let parsedQty = 0;
    if (isStockCategory) {
      parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        toast.error("La quantité doit être un nombre positif");
        return;
      }
      if (!stockItemId) {
        toast.error("Veuillez sélectionner un article du stock");
        return;
      }
    }

    // If stock-linked, create the stock movement first
    if (isStockCategory && stockDirection && stockItemId && parsedQty > 0) {
      const reason = category;
      const unitPrice = Math.round(parsedAmount / parsedQty);
      const result = addStockMovement(
        stockItemId,
        stockDirection,
        parsedQty,
        unitPrice,
        reason,
        date,
        currentUser?.displayName ?? 'Inconnu',
      );
      if (!result.success) {
        toast.error(result.error ?? "Erreur lors de la mise à jour du stock");
        return;
      }
    }

    addTransaction({
      departmentId: departmentId as DepartmentId,
      type,
      paymentMethod,
      category,
      personName: personName.trim(),
      description,
      amount: parsedAmount,
      date,
      ...(isStockCategory && parsedQty > 0 ? { quantity: parsedQty, stockItemId } : {}),
      ...(isEnrollmentCategory(category) ? { enrollmentDate: new Date().toISOString() } : {}),
      ...(isTranche(category) ? { tranche: category.replace('Frais de formation - ', '') } : {}),
      ...(isEnrollment && formationName ? { formationName } : {}),
      ...(isEnrollment && desiredTrainingDate ? { desiredTrainingDate } : {}),
      ...(isEnrollment && selectedKitElements.length > 0 ? { formationKit: selectedKitElements } : {}),
    });

    const currentUser = getCurrentUser();
    if (currentUser) {
      addAuditEntry({
        userId: currentUser.id,
        username: currentUser.username,
        action: 'create',
        entityType: 'transaction',
        entityId: '',
        details: `Création: ${category} - ${personName.trim()} - ${parsedAmount} FCFA (${departmentId})`,
        previousData: '',
        newData: JSON.stringify({ departmentId, type, paymentMethod, category, personName: personName.trim(), description, amount: parsedAmount, date }),
      });
    }

    toast.success("Transaction ajoutée avec succès");
    navigate(departmentId ? `/department/${departmentId}` : '/');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Button>

      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2">
          {selectedDept && (
            <div className="flex items-center gap-3 mb-3">
              <img src={selectedDept.logo} alt={selectedDept.name} className="h-10 w-10 rounded-xl object-cover shadow-sm" />
              <span className="text-sm font-medium text-muted-foreground">{selectedDept.name}</span>
            </div>
          )}
          <CardTitle className="text-xl">Nouvelle transaction</CardTitle>
        </CardHeader>
        <CardContent>
          {!canCreate ? (
            <div className="text-center py-8 space-y-3">
              <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Vous n'avez pas le droit de créer des transactions.</p>
              <p className="text-xs text-muted-foreground">Contactez le Super Admin pour obtenir cette permission.</p>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Département *</Label>
                <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setCategory(''); setStockItemId(''); setQuantity(''); setFormationName(''); setSelectedKitElements([]); setDesiredTrainingDate(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un département" />
                  </SelectTrigger>
                  <SelectContent>
                    {accessibleDepts.map((d) => (
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

              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={type} onValueChange={(v) => { setType(v as 'income' | 'expense'); setCategory(''); setStockItemId(''); setQuantity(''); setFormationName(''); setSelectedKitElements([]); setDesiredTrainingDate(''); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Entrée (Revenu)</SelectItem>
                    <SelectItem value="expense">Sortie (Dépense)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Caisse *</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une caisse" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catégorie *</Label>
                <Select value={category} onValueChange={(v) => { setCategory(v); setStockItemId(''); setQuantity(''); setFormationName(''); setSelectedKitElements([]); setDesiredTrainingDate(''); }} disabled={!departmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Montant (FCFA) *</Label>
              <Input
                type="number"
                step="1"
                placeholder="Ex: 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
              />
            </div>

            {/* Stock fields for GABA stock categories */}
            {isStockCategory && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Package className="h-4 w-4" />
                  {stockDirection === 'entry' ? 'Entrée en stock (achat)' : 'Sortie de stock (vente)'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Article du stock *</Label>
                    <Select value={stockItemId} onValueChange={setStockItemId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un article" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStockItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.currentQuantity} {item.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableStockItems.length === 0 && (
                      <p className="text-xs text-muted-foreground">Aucun article en stock. Créez-en d'abord dans la gestion des stocks.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Quantité *</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Nombre d'unités"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                    {stockItemId && quantity && parseInt(quantity) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Prix unitaire ≈ {amount && parseInt(amount) > 0
                          ? new Intl.NumberFormat('fr-FR').format(Math.round(parseInt(amount) / parseInt(quantity))) + ' FCFA'
                          : '—'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Nom de la personne *</Label>
              <Input
                placeholder="Ex: Jean Dupont, Marie Kamga..."
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">Client, fournisseur, formé, élève, etc.</p>
            </div>

            {isEnrollment && (
              <div className="rounded-lg border border-dashed border-blue-400/40 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                  <GraduationCap className="h-4 w-4" />
                  Inscription / Formation
                </div>
                <p className="text-xs text-muted-foreground">La date d'inscription sera enregistrée automatiquement par le système.</p>
                {isTranche(category) && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">Tranche : <span className="font-semibold">{category.replace('Frais de formation - ', '')}</span></p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Formation choisie *</Label>
                    <Select value={formationName} onValueChange={handleFormationChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une formation" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFormations.map((f) => (
                          <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date souhaitée de formation</Label>
                    <Input type="date" value={desiredTrainingDate} onChange={(e) => setDesiredTrainingDate(e.target.value)} />
                  </div>
                </div>

                {selectedFormation && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Éléments du kit / formation
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedFormation.kitElements.map((element) => (
                        <label key={element} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2 hover:bg-accent">
                          <Checkbox
                            checked={selectedKitElements.includes(element)}
                            onCheckedChange={() => toggleKitElement(element)}
                          />
                          {element}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Description de la transaction..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Annuler
              </Button>
              <Button type="submit">
                Ajouter la transaction
              </Button>
            </div>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
