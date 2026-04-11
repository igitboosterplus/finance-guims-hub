import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { departments, addTransaction, PAYMENT_METHODS, isEnrollmentCategory, isInscriptionCategory, isTranche, type DepartmentId, type PaymentMethod, formatCurrency } from "@/lib/data";
import { addAuditEntry, getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import { getStockItems, addStockMovement, getFormationsByDepartment, addPaymentPlan, addInstallment, getPaymentPlans, getEnrolledStudents, buildAllocationMessage, updatePlanInscription, getAllocationSummary, getRemainingAmount, addEnrollment, getEnrollmentsByFormation, updateEnrollment, type StockItem, type FormationCatalog, type FormationPack } from "@/lib/stock";
import { toast } from "sonner";
import { ArrowLeft, ShieldAlert, Package, GraduationCap, Star, Award, Calendar, CreditCard, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
  const [phoneNumber, setPhoneNumber] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState('');
  const [stockItemId, setStockItemId] = useState('');
  const [formationName, setFormationName] = useState('');
  const [formationPackId, setFormationPackId] = useState('');
  const [desiredTrainingDate, setDesiredTrainingDate] = useState('');

  const selectedDept = departments.find(d => d.id === departmentId);
  const categories = selectedDept
    ? type === 'income' ? selectedDept.incomeCategories : selectedDept.expenseCategories
    : [];

  // Categories that involve stock movements (multi-department)
  const STOCK_CATEGORIES_MAP: Record<string, Record<string, 'entry' | 'exit'>> = {
    'gaba': {
      'Achat composants intrants': 'entry',
      'Achat géniteurs': 'entry',
      'Vente intrants': 'exit',
      'Vente géniteurs': 'exit',
    },
    'guims-academy': {
      'Matériel de formation': 'entry',
      'Location salle': 'entry',
    },
  };
  const deptStockMap = STOCK_CATEGORIES_MAP[departmentId] ?? {};
  const isStockCategory = category in deptStockMap;
  const stockDirection = isStockCategory ? deptStockMap[category] : null;
  const availableStockItems: StockItem[] = isStockCategory ? getStockItems(departmentId) : [];

  // Formation enrollment
  const isEnrollment = isEnrollmentCategory(category);
  const availableFormations: FormationCatalog[] = (departmentId && isEnrollment)
    ? getFormationsByDepartment(departmentId as DepartmentId)
    : [];
  const selectedFormation = availableFormations.find(f => f.name === formationName);
  const selectedPack = selectedFormation?.packs.find(p => p.id === formationPackId);
  const isTrancheMode = selectedFormation?.mode === 'tranches';

  // Auto-suggest enrolled students for tranche payments
  const enrolledStudents = (isTranche(category) && selectedFormation)
    ? getEnrolledStudents(selectedFormation.id)
    : [];

  const handleFormationChange = (name: string) => {
    setFormationName(name);
    setFormationPackId('');
    const formation = availableFormations.find(f => f.name === name);
    // Auto-fill inscription fee when category is an inscription category
    if (formation && isInscriptionCategory(category)) {
      autoFillInscriptionFee(formation);
    }
    // For tranche-mode formations, auto-set amount based on selected category
    if (formation?.mode === 'tranches') {
      autoFillTrancheAmount(formation);
    }
  };

  /** Auto-fill inscription fee from formation config.
   *  If a plan already exists for this person with partial payment, use remaining amount. */
  const autoFillInscriptionFee = (formation: FormationCatalog) => {
    const fee = formation.inscriptionFee;
    if (!fee || fee <= 0) return;
    // Check for existing plan with partial inscription
    if (personName.trim()) {
      const existingPlans = getPaymentPlans();
      const existingPlan = existingPlans.find(p =>
        p.clientName.toLowerCase() === personName.trim().toLowerCase() &&
        p.formationId === formation.id &&
        p.status === 'en_cours'
      );
      if (existingPlan) {
        const alreadyPaid = existingPlan.inscriptionPaidAmount || (existingPlan.inscriptionPaid ? (existingPlan.inscriptionFee || 0) : 0);
        const remaining = (existingPlan.inscriptionFee || fee) - alreadyPaid;
        if (remaining > 0) {
          setAmount(String(remaining));
          return;
        }
        // Already fully paid
        return;
      }
    }
    setAmount(String(fee));
  };

  /** Auto-fill amount from tranche configuration based on current category.
   *  If a plan already exists for this person, use the REMAINING amount instead of the full tranche. */
  const autoFillTrancheAmount = (formation: FormationCatalog) => {
    if (!formation.tranches) return;

    // Check if there's an existing plan — if so, use allocation-aware remaining amount
    if (personName.trim()) {
      const existingPlans = getPaymentPlans();
      const existingPlan = existingPlans.find(p =>
        p.clientName.toLowerCase() === personName.trim().toLowerCase() &&
        p.formationId === formation.id &&
        p.status === 'en_cours'
      );
      if (existingPlan) {
        const alloc = getAllocationSummary(existingPlan);
        if (isTranche(category)) {
          const trancheNum = category.replace('Frais de formation - Tranche ', '');
          const matchedAlloc = alloc.find(a => a.name.includes(trancheNum));
          if (matchedAlloc && matchedAlloc.remaining > 0) {
            setAmount(String(matchedAlloc.remaining));
            return;
          }
        }
        // For 'Complet' or if selected tranche is already paid, show total remaining
        const totalRemaining = getRemainingAmount(existingPlan);
        if (totalRemaining > 0) {
          setAmount(String(totalRemaining));
          return;
        }
      }
    }

    // No existing plan or person not entered yet — use scheduled tranche amount
    if (category === 'Frais de formation - Complet' && formation.totalPrice) {
      setAmount(String(formation.totalPrice));
    } else if (isTranche(category)) {
      const trancheNum = category.replace('Frais de formation - Tranche ', '');
      const matched = formation.tranches.find(t => t.name.includes(trancheNum));
      if (matched) setAmount(String(matched.amount));
    }
  };

  const handlePackChange = (packId: string) => {
    setFormationPackId(packId);
    // Auto-set amount from pack price
    const formation = availableFormations.find(f => f.name === formationName);
    const pack = formation?.packs.find(p => p.id === packId);
    if (pack && pack.price > 0) {
      setAmount(String(pack.price));
    }
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

    // Require formation selection for enrollment categories
    if (isEnrollment && availableFormations.length > 0 && !formationName) {
      toast.error("Veuillez sélectionner une formation pour cette inscription");
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
        undefined,
        undefined,
        departmentId,
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
      phoneNumber: phoneNumber.trim() || undefined,
      description,
      amount: parsedAmount,
      date,
      ...(isStockCategory && parsedQty > 0 ? { quantity: parsedQty, stockItemId } : {}),
      ...(isEnrollmentCategory(category) ? { enrollmentDate: new Date().toISOString() } : {}),
      ...(isTranche(category) ? { tranche: category.replace('Frais de formation - ', '') } : {}),
      ...(isEnrollment && formationName ? { formationName: selectedPack ? `${formationName} — ${selectedPack.name}` : isTrancheMode && isTranche(category) ? `${formationName} — ${category.replace('Frais de formation - ', '')}` : formationName } : {}),
      ...(isEnrollment && desiredTrainingDate ? { desiredTrainingDate } : {}),
      ...(isEnrollment && selectedPack ? { formationKit: selectedPack.kitItems.map(k => k.label).filter(Boolean) } : {}),
    });

    // ==================== AUTO-CREATE PAYMENT PLAN FOR FORMATION ENROLLMENTS ====================
    if (isEnrollment && selectedFormation) {
      const existingPlans = getPaymentPlans();
      const isInscription = isInscriptionCategory(category);
      const formationInscriptionFee = selectedFormation.inscriptionFee || 0;

      // Determine total amount and scheduled tranches based on formation mode
      let totalAmount = 0;
      let scheduledTranches: { id: string; name: string; amount: number; dueDate: string }[] = [];
      let planLabel = selectedFormation.name;
      let packIdForPlan: string | undefined;

      if (selectedFormation.mode === 'tranches' && selectedFormation.tranches?.length) {
        totalAmount = selectedFormation.totalPrice
          ?? selectedFormation.tranches.reduce((s, t) => s + t.amount, 0);
        scheduledTranches = selectedFormation.tranches.map(t => ({
          id: crypto.randomUUID(),
          name: t.name,
          amount: t.amount,
          dueDate: t.deadline,
        }));
      } else if (selectedFormation.mode === 'packs' && selectedPack) {
        totalAmount = selectedPack.price;
        planLabel = `${selectedFormation.name} — ${selectedPack.name}`;
        packIdForPlan = selectedPack.id;
      } else {
        totalAmount = selectedFormation.totalPrice || parsedAmount;
      }

      // Check for existing plan (dedup by client + formation + optional pack)
      const existingPlan = existingPlans.find(p =>
        p.clientName.toLowerCase() === personName.trim().toLowerCase() &&
        p.formationId === selectedFormation.id &&
        (packIdForPlan ? p.packId === packIdForPlan : !p.packId) &&
        p.status === 'en_cours'
      );

      if (existingPlan) {
        // Plan exists
        if (isInscription) {
          // Partial/full inscription payment on existing plan
          const updatedPlan = updatePlanInscription(existingPlan.id, false, undefined, parsedAmount);
          if (updatedPlan) {
            const totalFee = updatedPlan.inscriptionFee || 0;
            const totalPaid = updatedPlan.inscriptionPaidAmount || 0;
            const remaining = totalFee - totalPaid;
            if (remaining <= 0) {
              toast.success(`✅ Inscription de ${formatCurrency(totalPaid)} payée intégralement pour ${personName.trim()}`);
            } else {
              toast.success(`💰 Inscription : ${formatCurrency(totalPaid)} payé — reste ${formatCurrency(remaining)} pour ${personName.trim()}`);
            }
          } else {
            toast.success(`Inscription de ${formatCurrency(parsedAmount)} enregistrée pour ${personName.trim()}`);
          }
        } else if (parsedAmount > 0) {
          // Normalize note to short format ("Tranche 1" not "Frais de formation - Tranche 1")
          const shortNote = isTranche(category) ? category.replace('Frais de formation - ', '') : category;
          const updatedPlan = addInstallment(existingPlan.id, {
            amount: parsedAmount,
            date,
            paymentMethod,
            note: shortNote,
            recordedBy: currentUser?.displayName ?? 'Inconnu',
          });
          const allocMsg = updatedPlan ? buildAllocationMessage(updatedPlan) : '';
          toast.success(`Paiement de ${formatCurrency(parsedAmount)} ajouté au suivi de ${personName.trim()}${allocMsg ? ` — ${allocMsg}` : ''}`);
        }
      } else {
        // Create new PaymentPlan — totalAmount = formation price only (not including inscription)
        const plan = addPaymentPlan({
          departmentId: departmentId as DepartmentId,
          clientName: personName.trim(),
          planType: 'formation',
          label: planLabel,
          description: `Inscription automatique — ${category}`,
          totalAmount,
          createdBy: currentUser?.displayName ?? 'Inconnu',
          ...(scheduledTranches.length > 0 ? { scheduledTranches } : {}),
          formationId: selectedFormation.id,
          ...(packIdForPlan ? { packId: packIdForPlan } : {}),
          inscriptionFee: isInscription ? (formationInscriptionFee > 0 ? formationInscriptionFee : parsedAmount) : (formationInscriptionFee > 0 ? formationInscriptionFee : undefined),
          inscriptionPaid: isInscription && parsedAmount >= (formationInscriptionFee > 0 ? formationInscriptionFee : parsedAmount),
          inscriptionPaidAmount: isInscription ? parsedAmount : undefined,
        });

        if (isInscription) {
          const totalFee = formationInscriptionFee > 0 ? formationInscriptionFee : parsedAmount;
          const remaining = totalFee - parsedAmount;
          if (remaining <= 0) {
            toast.success(`📋 Suivi créé pour ${personName.trim()} — ${planLabel}. ✅ Inscription payée (${formatCurrency(parsedAmount)}). Formation: ${formatCurrency(totalAmount)} à payer.`);
          } else {
            toast.success(`📋 Suivi créé pour ${personName.trim()} — ${planLabel}. 💰 Inscription : ${formatCurrency(parsedAmount)} payé — reste ${formatCurrency(remaining)}. Formation: ${formatCurrency(totalAmount)} à payer.`);
          }
        } else if (parsedAmount > 0) {
          // Normal formation payment — record as installment
          const shortNote = isTranche(category) ? category.replace('Frais de formation - ', '') : category;
          const updatedPlan = addInstallment(plan.id, {
            amount: parsedAmount,
            date,
            paymentMethod,
            note: shortNote,
            recordedBy: currentUser?.displayName ?? 'Inconnu',
          });
          const remaining = totalAmount - parsedAmount;
          const allocMsg = updatedPlan ? buildAllocationMessage(updatedPlan) : '';
          if (remaining <= 0) {
            toast.success(`Plan de paiement créé et complété pour ${personName.trim()} — ${planLabel}`);
          } else {
            toast.success(`📋 Suivi créé pour ${personName.trim()} — ${planLabel}. Reste: ${formatCurrency(remaining)}${allocMsg ? ` (${allocMsg})` : ''}`);
          }
        }
      }

      // ==================== AUTO-CREATE ENROLLMENT IN FORMATIONS LIST ====================
      const trimmedName = personName.trim();
      const existingEnrollments = getEnrollmentsByFormation(selectedFormation.id);
      const alreadyEnrolled = existingEnrollments.some(
        e => e.fullName.toLowerCase() === trimmedName.toLowerCase() && e.status !== 'annulé'
      );
      if (!alreadyEnrolled) {
        addEnrollment({
          formationId: selectedFormation.id,
          packId: selectedPack?.id || undefined,
          fullName: trimmedName,
          status: 'inscrit',
          enrolledBy: currentUser?.displayName ?? 'Inconnu',
        });
      } else if (selectedPack) {
        // Update pack if person already enrolled but chose a different pack
        const existing = existingEnrollments.find(
          e => e.fullName.toLowerCase() === trimmedName.toLowerCase() && e.status !== 'annulé'
        );
        if (existing && existing.packId !== selectedPack.id) {
          updateEnrollment(existing.id, { packId: selectedPack.id });
        }
      }
    }

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
                <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setCategory(''); setStockItemId(''); setQuantity(''); setFormationName(''); setFormationPackId(''); setDesiredTrainingDate(''); setPhoneNumber(''); }}>
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
                <Select value={type} onValueChange={(v) => { setType(v as 'income' | 'expense'); setCategory(''); setStockItemId(''); setQuantity(''); setFormationName(''); setFormationPackId(''); setDesiredTrainingDate(''); }}>
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
                <Select value={category} onValueChange={(v) => { setCategory(v); setStockItemId(''); setQuantity(''); setFormationName(''); setFormationPackId(''); setDesiredTrainingDate(''); }} disabled={!departmentId}>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom de la personne *</Label>
                <Input
                  placeholder="Ex: Jean Dupont, Marie Kamga..."
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  maxLength={100}
                  list={enrolledStudents.length > 0 ? "enrolled-students-list" : undefined}
                />
                {enrolledStudents.length > 0 && (
                  <datalist id="enrolled-students-list">
                    {enrolledStudents.map((name, i) => (
                      <option key={i} value={name} />
                    ))}
                  </datalist>
                )}
                <p className="text-xs text-muted-foreground">
                  {enrolledStudents.length > 0
                    ? `${enrolledStudents.length} étudiant(s) inscrit(s) — commencez à taper pour voir les suggestions`
                    : 'Client, fournisseur, formé, élève, etc.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Numéro de téléphone</Label>
                <Input
                  type="tel"
                  placeholder="Ex: 6 99 00 00 00"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  maxLength={20}
                />
              </div>
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

                {availableFormations.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Aucune formation configurée pour ce département. Créez-en dans le catalogue des formations.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Formation choisie *</Label>
                        <Select value={formationName} onValueChange={handleFormationChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner une formation" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFormations.map((f) => (
                              <SelectItem key={f.id} value={f.name}>
                                {f.name}
                                {f.mode === 'tranches' && ' (tranches)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isInscriptionCategory(category) && (
                        <div className="space-y-2">
                          <Label>Date souhaitée de formation</Label>
                          <Input type="date" value={desiredTrainingDate} onChange={(e) => setDesiredTrainingDate(e.target.value)} />
                        </div>
                      )}
                    </div>

                    {/* Inscription fee info — shows for inscription categories with known fee */}
                    {selectedFormation && isInscriptionCategory(category) && selectedFormation.inscriptionFee && selectedFormation.inscriptionFee > 0 && (() => {
                      const fee = selectedFormation.inscriptionFee!;
                      const existingPlans = getPaymentPlans();
                      const existingPlan = existingPlans.find(p =>
                        personName.trim() &&
                        p.clientName.toLowerCase() === personName.trim().toLowerCase() &&
                        p.formationId === selectedFormation.id &&
                        p.status === 'en_cours'
                      );
                      const alreadyPaid = existingPlan
                        ? (existingPlan.inscriptionPaidAmount || (existingPlan.inscriptionPaid ? (existingPlan.inscriptionFee || 0) : 0))
                        : 0;
                      const remaining = fee - alreadyPaid;
                      return (
                        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                            Frais d'inscription : {formatCurrency(fee)}
                          </p>
                          {alreadyPaid > 0 && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              {remaining <= 0
                                ? `✅ Déjà payé intégralement (${formatCurrency(alreadyPaid)})`
                                : `💰 Déjà payé : ${formatCurrency(alreadyPaid)} — reste ${formatCurrency(remaining)}`
                              }
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Pack selection — for pack-mode formations */}
                    {selectedFormation && !isTrancheMode && selectedFormation.packs.length > 0 && (
                      <div className="space-y-3">
                        <Label>Pack / Formule *</Label>
                        <div className={`grid grid-cols-1 ${selectedFormation.packs.length >= 3 ? 'md:grid-cols-3' : selectedFormation.packs.length === 2 ? 'md:grid-cols-2' : ''} gap-3`}>
                          {selectedFormation.packs.map((pack, pi) => {
                            const isSelected = formationPackId === pack.id;
                            const packColors = [
                              isSelected ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500' : 'border-blue-200 bg-white dark:bg-blue-950/20 hover:border-blue-400',
                              isSelected ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/50 ring-2 ring-amber-500' : 'border-amber-200 bg-white dark:bg-amber-950/20 hover:border-amber-400',
                              isSelected ? 'border-purple-500 bg-purple-100 dark:bg-purple-900/50 ring-2 ring-purple-500' : 'border-purple-200 bg-white dark:bg-purple-950/20 hover:border-purple-400',
                            ];
                            const icons = [Award, Star, Award];
                            const IconComp = icons[pi % icons.length];
                            return (
                              <button
                                key={pack.id}
                                type="button"
                                onClick={() => handlePackChange(pack.id)}
                                className={`rounded-lg border-2 p-3 text-left transition-all space-y-2 ${packColors[pi % packColors.length]}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 font-semibold text-sm">
                                    <IconComp className="h-4 w-4" />
                                    {pack.name}
                                  </span>
                                  <Badge className="text-xs">{formatCurrency(pack.price)}</Badge>
                                </div>
                                {pack.advantages.filter(a => a.description).length > 0 && (
                                  <ul className="space-y-0.5">
                                    {pack.advantages.filter(a => a.description).map((a, ai) => (
                                      <li key={ai} className="text-[11px] text-foreground/80 flex items-start gap-1">
                                        <span className="text-success mt-0.5 shrink-0">✓</span>
                                        {a.description}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {pack.kitItems.length > 0 && (
                                  <>
                                    <Separator className="my-1" />
                                    <div className="space-y-0.5">
                                      {pack.kitItems.map((kit, ki) => (
                                        <div key={ki} className="text-[11px] flex items-center justify-between gap-1">
                                          <span className="flex items-center gap-1">
                                            <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                                            {kit.label}{kit.quantity > 1 ? ` ×${kit.quantity}` : ''}
                                          </span>
                                          {kit.specialPrice !== undefined && kit.normalPrice ? (
                                            <span className="shrink-0">
                                              <span className="line-through text-muted-foreground">{formatCurrency(kit.normalPrice)}</span>
                                              {' '}
                                              <span className="font-semibold text-success">{kit.specialPrice === 0 ? 'Gratuit' : formatCurrency(kit.specialPrice)}</span>
                                            </span>
                                          ) : kit.specialPrice === 0 ? (
                                            <span className="font-semibold text-success shrink-0">Gratuit</span>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Tranche info — for tranche-mode formations */}
                    {selectedFormation && isTrancheMode && selectedFormation.tranches && selectedFormation.tranches.length > 0 && (
                      <div className="space-y-3">
                        <Label className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" />
                          Échéancier des tranches
                        </Label>
                        <div className={`grid grid-cols-1 ${selectedFormation.tranches.length >= 3 ? 'md:grid-cols-3' : selectedFormation.tranches.length === 2 ? 'md:grid-cols-2' : ''} gap-3`}>
                          {selectedFormation.tranches.map((tranche, ti) => {
                            const trancheColors = ['border-green-200 bg-green-50 dark:bg-green-950/20', 'border-orange-200 bg-orange-50 dark:bg-orange-950/20', 'border-red-200 bg-red-50 dark:bg-red-950/20'];
                            const isOverdue = tranche.deadline && new Date(tranche.deadline) < new Date();
                            const isCurrentTranche = isTranche(category) && tranche.name.includes(category.replace('Frais de formation - Tranche ', ''));
                            return (
                              <div key={tranche.id} className={`rounded-lg border p-3 space-y-1.5 ${isCurrentTranche ? 'ring-2 ring-primary border-primary' : trancheColors[ti % trancheColors.length]}`}>
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-sm flex items-center gap-1.5">
                                    <CreditCard className="h-4 w-4" />
                                    {tranche.name}
                                    {isCurrentTranche && <Badge variant="default" className="text-[10px] ml-1">En cours</Badge>}
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
                        {selectedFormation.totalPrice && (
                          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2.5 flex items-center justify-between">
                            <span className="text-xs font-medium flex items-center gap-1">
                              <CreditCard className="h-3.5 w-3.5" />
                              Paiement complet
                            </span>
                            <Badge variant="secondary" className="text-xs">{formatCurrency(selectedFormation.totalPrice)}</Badge>
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
