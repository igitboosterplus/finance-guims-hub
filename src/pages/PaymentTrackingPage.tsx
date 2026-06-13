import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { departments, type DepartmentId, type PaymentMethod, formatCurrency, getPaymentMethodLabel, getPaymentMethodsForDepartment, addTransaction, isInscriptionCategory } from "@/lib/data";
import { addAuditEntry, addSuperAuditEntry, getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import {
  getPaymentPlans, addPaymentPlan, addInstallment, updatePaymentPlanStatus, deletePaymentPlan,
  getPaidAmount, getRemainingAmount, getPaymentReminders, getOverdueTranches, getAllocationSummary,
  updatePlanInscription,
  type PaymentPlan, type PaymentInstallment, type PaymentReminder, type ScheduledTranche,
} from "@/lib/stock";
import { toast } from "sonner";
import { CreditCard, Plus, Search, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, Archive, ArchiveRestore, Receipt, User, Users, CalendarDays, Banknote, AlertTriangle, Bell, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { dateInputToIsoTimestamp, formatLocalDateInputValue } from "@/lib/utils";
import { PaymentAlerts } from "@/components/PaymentAlerts";

const STATUS_CONFIG = {
  en_cours: { label: "En cours", icon: Clock, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  termine: { label: "Terminé", icon: CheckCircle2, color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  annule: { label: "Annulé", icon: XCircle, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  archive: { label: "Archivé", icon: Archive, color: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400" },
};

export default function PaymentTrackingPage() {
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus') || '';
  const currentUser = getCurrentUser();
  const canCreate = hasPermission(currentUser, 'canCreateTransaction');
  const canEdit = hasPermission(currentUser, 'canEditTransaction');

  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  // Create plan dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newDept, setNewDept] = useState<string>("");
  const [newClient, setNewClient] = useState("");
  const [newType, setNewType] = useState<'formation' | 'service'>('service');
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTotal, setNewTotal] = useState("");
  const [newTranches, setNewTranches] = useState<{ name: string; amount: string; dueDate: string }[]>([]);
  const [newGuimsEducMonthlyMode, setNewGuimsEducMonthlyMode] = useState(false);
  const [newMonthlyAmount, setNewMonthlyAmount] = useState("");
  const [newMonthlyMonths, setNewMonthlyMonths] = useState("10");
  const [newMonthlyStartDate, setNewMonthlyStartDate] = useState(formatLocalDateInputValue());
  const [newGuimsEducCategory, setNewGuimsEducCategory] = useState("");
  const [newParentName, setNewParentName] = useState("");
  const [newParentPhone, setNewParentPhone] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentClass, setNewStudentClass] = useState("");
  const [guimsEducCategoryFilter, setGuimsEducCategoryFilter] = useState<string>("all");

  // Reminders
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [overdue, setOverdue] = useState<PaymentReminder[]>([]);

  // Add installment dialog
  const [installOpen, setInstallOpen] = useState(false);
  const [installPlanId, setInstallPlanId] = useState<string | null>(null);
  const [installAmount, setInstallAmount] = useState("");
  const [installDate, setInstallDate] = useState(formatLocalDateInputValue());
  const [installMethod, setInstallMethod] = useState("especes");
  const [installNote, setInstallNote] = useState("");

  // Archive (no delete from suivi)

  const accessibleDepts = departments.filter(d => hasDepartmentAccess(currentUser, d.id));
  const installPaymentMethods = getPaymentMethodsForDepartment(plans.find(p => p.id === installPlanId)?.departmentId);

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (focus === 'monthly-deficit') {
      setFilterStatus('en_cours');
      setFilterDept('all');
    }
    if (focus === 'guims-educ-reminders') {
      setFilterStatus('en_cours');
      setFilterDept('guims-educ');
    }
  }, [focus]);

  useEffect(() => {
    if (newDept === 'guims-educ' && newGuimsEducMonthlyMode) {
      setNewType('service');
    }
  }, [newDept, newGuimsEducMonthlyMode]);

  const refresh = () => {
    setPlans(getPaymentPlans());
    setReminders(getPaymentReminders());
    setOverdue(getOverdueTranches());
  };

  const filtered = plans.filter(p => {
    if (filterDept !== "all" && p.departmentId !== filterDept) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.clientName.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    // En cours first, then terminé, then annulé, then archivé
    const order: Record<string, number> = { en_cours: 0, termine: 1, annule: 2, archive: 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getFormationName = (plan: PaymentPlan) => {
    if (plan.formationId) return (plan.label.split(' — ')[0] || plan.label).trim();
    return (plan.label.split(' — ')[0] || plan.label).trim();
  };

  const formationPlans = filtered.filter(p => p.planType === 'formation');
  const servicePlans = filtered.filter(p => p.planType === 'service');
  const guimsEducReminders = reminders.filter(r => r.departmentId === 'guims-educ');
  const guimsEducOverdue = overdue.filter(r => r.departmentId === 'guims-educ');
  const guimsEducReminderTotal = guimsEducReminders.reduce((sum, r) => sum + r.trancheAmount, 0);
  const guimsEducOverdueTotal = guimsEducOverdue.reduce((sum, r) => sum + r.trancheAmount, 0);
  const guimsEducPlans = plans.filter((p) => p.departmentId === 'guims-educ' && p.status !== 'archive');
  const guimsEducPlansFiltered = guimsEducCategoryFilter === 'all'
    ? guimsEducPlans
    : guimsEducPlans.filter((p) => (p.guimsEducCategory || 'Non classé') === guimsEducCategoryFilter);

  const guimsEducCategoryStats = Object.values(
    guimsEducPlans.reduce((acc, plan) => {
      const category = (plan.guimsEducCategory || 'Non classé').trim() || 'Non classé';
      if (!acc[category]) {
        acc[category] = {
          category,
          plans: 0,
          students: 0,
          due: 0,
          paid: 0,
          overdue: 0,
        };
      }
      acc[category].plans += 1;
      acc[category].students += 1;
      acc[category].due += plan.totalAmount + (plan.inscriptionFee || 0);
      acc[category].paid += getPaidAmount(plan) + (plan.inscriptionPaidAmount || (plan.inscriptionPaid && plan.inscriptionFee ? plan.inscriptionFee : 0));
      if (guimsEducOverdue.some((o) => o.planId === plan.id)) {
        acc[category].overdue += 1;
      }
      return acc;
    }, {} as Record<string, { category: string; plans: number; students: number; due: number; paid: number; overdue: number }>),
  ).sort((a, b) => a.category.localeCompare(b.category));

  const guimsEducMonthColumns = Array.from(
    new Set(
      guimsEducPlansFiltered
        .flatMap((p) => p.scheduledTranches || [])
        .map((tr) => {
          const d = new Date(tr.dueDate);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
          return JSON.stringify({ monthKey, monthLabel });
        }),
    ),
  )
    .map((item) => JSON.parse(item) as { monthKey: string; monthLabel: string })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const formationGroups = Object.values(
    formationPlans.reduce((acc, plan) => {
      const formationName = getFormationName(plan);
      const key = `${plan.departmentId}::${plan.formationId ?? formationName.toLowerCase()}`;
      if (!acc[key]) {
        acc[key] = {
          key,
          formationName,
          departmentId: plan.departmentId,
          plans: [] as PaymentPlan[],
        };
      }
      acc[key].plans.push(plan);
      return acc;
    }, {} as Record<string, { key: string; formationName: string; departmentId: DepartmentId; plans: PaymentPlan[] }>),
  ).sort((a, b) => a.formationName.localeCompare(b.formationName));

  // Stats — include inscription fees in totals for full picture
  const activePlans = plans.filter(p => p.status === 'en_cours');
  const totalDue = activePlans.reduce((s, p) => s + p.totalAmount + (p.inscriptionFee || 0), 0);
  const totalPaid = activePlans.reduce((s, p) => s + getPaidAmount(p) + (p.inscriptionPaidAmount || (p.inscriptionPaid && p.inscriptionFee ? p.inscriptionFee : 0)), 0);
  const totalRemaining = totalDue - totalPaid;
  const topRiskPlans = [...activePlans]
    .sort((a, b) => getRemainingAmount(b) - getRemainingAmount(a))
    .slice(0, 5);

  const handleCreatePlan = () => {
    if (!newClient.trim()) { toast.error("Nom du client obligatoire"); return; }
    if (!newLabel.trim()) { toast.error("Libellé obligatoire"); return; }
    if (!newDept) { toast.error("Département obligatoire"); return; }
    const isGuimsEducMonthly = newDept === 'guims-educ' && newGuimsEducMonthlyMode;
    if (isGuimsEducMonthly) {
      if (!newGuimsEducCategory.trim()) { toast.error("Catégorie Guims Educ obligatoire"); return; }
      if (!newParentName.trim()) { toast.error("Nom du parent obligatoire"); return; }
      if (!newStudentName.trim()) { toast.error("Nom de l'élève obligatoire"); return; }
    }
    const total = isGuimsEducMonthly
      ? (parseInt(newMonthlyAmount || '0', 10) * parseInt(newMonthlyMonths || '0', 10))
      : parseInt(newTotal, 10);
    if (isNaN(total) || total <= 0) { toast.error("Montant total invalide"); return; }

    // Build scheduled tranches if any
    let scheduled: ScheduledTranche[] = [];
    if (isGuimsEducMonthly) {
      const monthlyAmount = parseInt(newMonthlyAmount || '0', 10);
      const monthlyMonths = parseInt(newMonthlyMonths || '0', 10);
      if (isNaN(monthlyAmount) || monthlyAmount <= 0) {
        toast.error("Mensualité invalide");
        return;
      }
      if (isNaN(monthlyMonths) || monthlyMonths <= 0 || monthlyMonths > 36) {
        toast.error("Nombre de mois invalide (1 à 36)");
        return;
      }
      if (!newMonthlyStartDate) {
        toast.error("Date de première échéance obligatoire");
        return;
      }

      const startDate = new Date(newMonthlyStartDate);
      if (Number.isNaN(startDate.getTime())) {
        toast.error("Date de première échéance invalide");
        return;
      }

      scheduled = Array.from({ length: monthlyMonths }, (_, index) => {
        const dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + index, startDate.getDate());
        return {
          id: crypto.randomUUID(),
          name: `Mensualité ${index + 1}`,
          amount: monthlyAmount,
          dueDate: dueDate.toISOString().slice(0, 10),
        };
      });
    } else {
      scheduled = newTranches
        .filter(t => t.name.trim() && t.amount && t.dueDate)
        .map(t => ({
          id: crypto.randomUUID(),
          name: t.name.trim(),
          amount: parseInt(t.amount) || 0,
          dueDate: t.dueDate,
        }))
        .filter(t => t.amount > 0);
    }

    addPaymentPlan({
      departmentId: newDept as DepartmentId,
      clientName: isGuimsEducMonthly ? newParentName.trim() : newClient.trim(),
      planType: isGuimsEducMonthly ? 'service' : newType,
      label: newLabel.trim(),
      description: newDesc.trim() || undefined,
      totalAmount: total,
      createdBy: currentUser?.displayName ?? "Inconnu",
      ...(isGuimsEducMonthly
        ? {
            guimsEducCategory: newGuimsEducCategory.trim(),
            parentName: newParentName.trim(),
            parentPhone: newParentPhone.trim() || undefined,
            studentName: newStudentName.trim(),
            studentClass: newStudentClass.trim() || undefined,
          }
        : {}),
      ...(scheduled.length > 0 ? { scheduledTranches: scheduled } : {}),
    });
    toast.success("Plan de paiement créé");
    setCreateOpen(false);
    resetCreateForm();
    refresh();
  };

  const resetCreateForm = () => {
    setNewClient(""); setNewLabel(""); setNewDesc(""); setNewTotal("");
    setNewType('service'); setNewDept(accessibleDepts[0]?.id || "");
    setNewTranches([]);
    setNewGuimsEducMonthlyMode((accessibleDepts[0]?.id || '') === 'guims-educ');
    setNewMonthlyAmount('');
    setNewMonthlyMonths('10');
    setNewMonthlyStartDate(formatLocalDateInputValue());
    setNewGuimsEducCategory('');
    setNewParentName('');
    setNewParentPhone('');
    setNewStudentName('');
    setNewStudentClass('');
  };

  const addNewTranche = () => {
    const idx = newTranches.length + 1;
    setNewTranches([...newTranches, { name: `Tranche ${idx}`, amount: "", dueDate: "" }]);
  };

  const updateNewTranche = (i: number, field: string, value: string) => {
    const copy = [...newTranches];
    copy[i] = { ...copy[i], [field]: value };
    setNewTranches(copy);
  };

  const removeNewTranche = (i: number) => {
    setNewTranches(newTranches.filter((_, idx) => idx !== i));
  };

  const openCreateDialog = () => {
    resetCreateForm();
    setNewDept(accessibleDepts[0]?.id || "");
    setNewGuimsEducMonthlyMode((accessibleDepts[0]?.id || '') === 'guims-educ');
    setCreateOpen(true);
  };

  const openInstallDialog = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    setInstallPlanId(planId);
    // Pre-fill with next unpaid/partial tranche using allocation summary
    if (plan && plan.scheduledTranches && plan.scheduledTranches.length > 0) {
      const alloc = getAllocationSummary(plan);
      const next = alloc.find(a => a.status !== 'paid');
      if (next) {
        setInstallAmount(String(next.remaining));
        setInstallNote(next.name);
      } else {
        setInstallAmount(plan ? String(getRemainingAmount(plan)) : "");
        setInstallNote("");
      }
    } else {
      setInstallAmount(plan ? String(getRemainingAmount(plan)) : "");
      setInstallNote("");
    }
    setInstallDate(formatLocalDateInputValue());
    setInstallMethod("especes");
    setInstallOpen(true);
  };

  const handleAddInstallment = () => {
    if (!installPlanId) return;
    const amount = parseInt(installAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Montant invalide"); return; }
    if (!installDate) { toast.error("Date obligatoire"); return; }

    const plan = plans.find(p => p.id === installPlanId);
    if (!plan) return;
    const transactionTimestamp = dateInputToIsoTimestamp(installDate);

    const noteText = installNote.trim();
    const isInscriptionPayment = isInscriptionCategory(noteText);

    if (isInscriptionPayment) {
      // Inscription: track separately, not as a formation installment
      // Pass amount as 4th param (paidAmount) to accumulate, not overwrite the fee
      updatePlanInscription(installPlanId, false, undefined, amount);
      const tx = addTransaction({
        departmentId: plan.departmentId,
        type: 'income',
        paymentMethod: installMethod as PaymentMethod,
        category: noteText,
        personName: plan.clientName,
        description: `Inscription ${plan.label}`,
        amount,
        date: transactionTimestamp,
      });
      if (currentUser) {
        addAuditEntry({ userId: currentUser.id, username: currentUser.username, action: 'create', entityType: 'transaction', entityId: tx.id, details: `Inscription ${plan.clientName} — ${plan.label} : ${amount} FCFA (via suivi)`, previousData: '', newData: JSON.stringify({ type: 'income', amount, category: noteText, date: transactionTimestamp, paymentMethod: installMethod }) });
      }
      toast.success(`Inscription de ${formatCurrency(amount)} enregistrée (hors frais de formation)`);
    } else {
      addInstallment(installPlanId, {
        amount,
        date: installDate,
        paymentMethod: installMethod,
        note: noteText || undefined,
        recordedBy: currentUser?.displayName ?? "Inconnu",
      });
      // Determine proper category for the transaction
      const txCategory = noteText && noteText.startsWith('Tranche')
        ? `Frais de formation - ${noteText}`
        : noteText && noteText.toLowerCase().startsWith('mensualité')
        ? 'Mensualité parent'
        : noteText || 'Frais de formation';
      // Create a real transaction so the payment appears on the dashboard
      const tx = addTransaction({
        departmentId: plan.departmentId,
        type: 'income',
        paymentMethod: installMethod as PaymentMethod,
        category: txCategory,
        personName: plan.clientName,
        description: `Paiement ${plan.label} — ${noteText || 'versement'}`,
        amount,
        date: transactionTimestamp,
      });
      if (currentUser) {
        addAuditEntry({ userId: currentUser.id, username: currentUser.username, action: 'create', entityType: 'transaction', entityId: tx.id, details: `Paiement ${plan.clientName} — ${plan.label} : ${amount} FCFA (via suivi)`, previousData: '', newData: JSON.stringify({ type: 'income', amount, category: noteText || 'Frais de formation', date: transactionTimestamp, paymentMethod: installMethod }) });
      }
      toast.success("Paiement enregistré et visible au tableau de bord");
    }
    setInstallOpen(false);
    refresh();
  };

  const handleMarkComplete = (planId: string) => {
    updatePaymentPlanStatus(planId, 'termine');
    toast.success("Plan marqué comme terminé");
    refresh();
  };

  const handleArchive = (planId: string) => {
    updatePaymentPlanStatus(planId, 'archive');
    toast.success("Plan archivé — vous pourrez le restaurer à tout moment");
    refresh();
  };

  const handleReopen = (planId: string) => {
    updatePaymentPlanStatus(planId, 'en_cours');
    toast.success("Plan réouvert");
    refresh();
  };

  const handleDelete = (plan: PaymentPlan) => {
    const success = deletePaymentPlan(plan.id);
    if (success) {
      const currentUser = getCurrentUser();
      if (currentUser) {
        addSuperAuditEntry({
          userId: currentUser.id,
          username: currentUser.username,
          action: 'other',
          details: `Suppression plan de suivi: ${plan.clientName} — ${plan.label} (${plan.departmentId})`,
          targetEntityId: plan.id,
          metadata: JSON.stringify(plan),
        });
      }
      toast.success("Plan de suivi supprimé");
      refresh();
    } else {
      toast.error("Erreur lors de la suppression");
    }
  };

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name ?? id;
  const getMethodLabel = (m: string, departmentId?: DepartmentId) => getPaymentMethodLabel(m as PaymentMethod, departmentId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
            Suivi des paiements
          </h2>
          <p className="text-sm text-muted-foreground">
            {activePlans.length} plan{activePlans.length > 1 ? 's' : ''} en cours
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreateDialog} className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            Nouveau plan
          </Button>
        )}
      </div>

      {/* Summary cards */}
      {activePlans.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total dû (en cours)</p>
              <p className="text-lg font-bold">{formatCurrency(totalDue)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total encaissé</p>
              <p className="text-lg font-bold text-success">{formatCurrency(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Reste à percevoir</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totalRemaining)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Alerts */}
      <PaymentAlerts reminders={reminders} overdue={overdue} />

      {focus === 'monthly-deficit' && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Cas signalés: actions prioritaires sur déficit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {topRiskPlans.length === 0 ? (
              <p className="text-muted-foreground">Aucun plan en cours à prioriser.</p>
            ) : (
              topRiskPlans.map((plan) => (
                <div key={plan.id} className="rounded border border-destructive/30 px-2 py-1 flex items-center justify-between gap-2">
                  <span><strong>{plan.clientName}</strong> — {plan.label}</span>
                  <span className="font-semibold text-destructive">Reste: {formatCurrency(getRemainingAmount(plan))}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Reminders and overdue alerts */}
      {(reminders.length > 0 || overdue.length > 0) && (
        <div className="space-y-3">
          {(guimsEducReminders.length > 0 || guimsEducOverdue.length > 0) && (
            <Card className="border-primary/30 bg-primary/5 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-primary">Rappel paiements Guims Educ</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-card p-2">
                    <p className="text-muted-foreground">Échéances proches</p>
                    <p className="font-semibold">{guimsEducReminders.length} · {formatCurrency(guimsEducReminderTotal)}</p>
                  </div>
                  <div className="rounded-md border bg-card p-2">
                    <p className="text-muted-foreground">Mensualités en retard</p>
                    <p className="font-semibold text-destructive">{guimsEducOverdue.length} · {formatCurrency(guimsEducOverdueTotal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {overdue.length > 0 && (
            <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    {overdue.length} tranche{overdue.length > 1 ? 's' : ''} en retard
                  </p>
                </div>
                <div className="space-y-1.5">
                  {overdue.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-red-700 dark:text-red-300">
                        <strong>{r.clientName}</strong> — {r.trancheName} ({r.label})
                      </span>
                      <span className="text-red-600 dark:text-red-400 shrink-0">
                        {formatCurrency(r.trancheAmount)} · échue le {new Date(r.dueDate).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {reminders.length > 0 && (
            <Card className="border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Rappels de paiement
                  </p>
                </div>
                <div className="space-y-1.5">
                  {reminders.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-amber-700 dark:text-amber-300">
                        <strong>{r.clientName}</strong> — {r.trancheName} ({r.label})
                      </span>
                      <Badge className={`text-[10px] border-0 ${r.urgency === 'today' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                        {r.urgency === 'today' ? "Aujourd'hui" : 'Demain'} · {formatCurrency(r.trancheAmount)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {guimsEducPlans.length > 0 && (
        <div className="space-y-3">
          <Card className="border-primary/30 bg-primary/5 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dashboards Guims Educ par catégorie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={guimsEducCategoryFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setGuimsEducCategoryFilter('all')}
                >
                  Toutes catégories
                </Button>
                {guimsEducCategoryStats.map((item) => (
                  <Button
                    key={item.category}
                    type="button"
                    size="sm"
                    variant={guimsEducCategoryFilter === item.category ? 'default' : 'outline'}
                    onClick={() => setGuimsEducCategoryFilter(item.category)}
                  >
                    {item.category}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(guimsEducCategoryFilter === 'all'
                  ? guimsEducCategoryStats
                  : guimsEducCategoryStats.filter((s) => s.category === guimsEducCategoryFilter)
                ).map((item) => (
                  <div key={item.category} className="rounded-lg border bg-card p-3 text-xs space-y-1">
                    <p className="font-semibold text-sm">{item.category}</p>
                    <p>Parents/élèves: {item.students}</p>
                    <p>En retard: {item.overdue}</p>
                    <p>Encaissé: {formatCurrency(item.paid)}</p>
                    <p>Reste: {formatCurrency(item.due - item.paid)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/30 shadow-sm overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Suivi mensuel Guims Educ (parents / élèves)</CardTitle>
            </CardHeader>
            <CardContent>
              {guimsEducPlansFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun plan Guims Educ pour ce filtre.</p>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table className="min-w-[1100px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Prestation</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Téléphone</TableHead>
                        <TableHead>Élève</TableHead>
                        <TableHead>Classe</TableHead>
                        <TableHead>Inscription</TableHead>
                        {guimsEducMonthColumns.map((month) => (
                          <TableHead key={month.monthKey}>{month.monthLabel}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {guimsEducPlansFiltered
                        .slice()
                        .sort((a, b) => {
                          const cat = (a.guimsEducCategory || '').localeCompare(b.guimsEducCategory || '');
                          if (cat !== 0) return cat;
                          return (a.studentName || a.clientName).localeCompare(b.studentName || b.clientName);
                        })
                        .map((plan) => {
                          const alloc = getAllocationSummary(plan);
                          const byTrancheName = new Map(alloc.map((item) => [item.name, item]));
                          const inscriptionPaidAmount = plan.inscriptionPaidAmount || (plan.inscriptionPaid && plan.inscriptionFee ? plan.inscriptionFee : 0);
                          const inscriptionStatus = plan.inscriptionFee && plan.inscriptionFee > 0
                            ? inscriptionPaidAmount >= plan.inscriptionFee
                              ? 'Payée'
                              : inscriptionPaidAmount > 0
                                ? `Partielle (${formatCurrency(inscriptionPaidAmount)})`
                                : 'Non payée'
                            : 'N/A';

                          return (
                            <TableRow key={plan.id}>
                              <TableCell>{plan.guimsEducCategory || 'Non classé'}</TableCell>
                              <TableCell className="font-medium">{plan.label}</TableCell>
                              <TableCell>{plan.parentName || plan.clientName}</TableCell>
                              <TableCell>{plan.parentPhone || '—'}</TableCell>
                              <TableCell>{plan.studentName || '—'}</TableCell>
                              <TableCell>{plan.studentClass || '—'}</TableCell>
                              <TableCell>{inscriptionStatus}</TableCell>
                              {guimsEducMonthColumns.map((month) => {
                                const trancheForMonth = (plan.scheduledTranches || []).find((tr) => {
                                  const d = new Date(tr.dueDate);
                                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                  return key === month.monthKey;
                                });

                                if (!trancheForMonth) {
                                  return <TableCell key={`${plan.id}-${month.monthKey}`}>—</TableCell>;
                                }

                                const allocItem = byTrancheName.get(trancheForMonth.name);
                                const text = allocItem?.status === 'paid'
                                  ? 'Payée'
                                  : allocItem?.status === 'partial'
                                    ? `Partielle (${formatCurrency(allocItem.paid)})`
                                    : `Due ${formatCurrency(trancheForMonth.amount)}`;

                                return <TableCell key={`${plan.id}-${month.monthKey}`}>{text}</TableCell>;
                              })}
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher par client ou service..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous départements</SelectItem>
            {accessibleDepts.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="termine">Terminé</SelectItem>
            <SelectItem value="annule">Annulé</SelectItem>
            <SelectItem value="archive">Archivé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Plans list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Aucun plan de paiement</p>
          <p className="text-sm">{search ? "Essayez une autre recherche" : "Créez un plan pour suivre les paiements en tranches ou avances"}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {formationGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Fiches par formation</p>
              </div>

              {formationGroups.map(group => {
                const groupPaid = group.plans.reduce((s, p) => s + getPaidAmount(p), 0);
                const groupTotal = group.plans.reduce((s, p) => s + p.totalAmount, 0);
                const groupRemaining = groupTotal - groupPaid;

                return (
                  <Card key={group.key} className={`border-0 shadow-md overflow-hidden ${focus === 'monthly-deficit' ? 'ring-1 ring-destructive/30' : ''}`}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-base sm:text-lg">{group.formationName}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px]">{getDeptName(group.departmentId)}</Badge>
                            <Badge variant="outline" className="text-[10px]">{group.plans.length} étudiant{group.plans.length > 1 ? 's' : ''}</Badge>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-success font-semibold">Encaissé: {formatCurrency(groupPaid)}</p>
                          <p className="text-muted-foreground">Reste: {formatCurrency(groupRemaining)}</p>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {group.plans
                        .slice()
                        .sort((a, b) => a.clientName.localeCompare(b.clientName))
                        .map(plan => {
                          const paid = getPaidAmount(plan);
                          const remaining = getRemainingAmount(plan);
                          const progress = plan.totalAmount > 0 ? Math.round((paid / plan.totalAmount) * 100) : 0;
                          const isExpanded = expandedPlan === plan.id;
                          const statusCfg = STATUS_CONFIG[plan.status];
                          const StatusIcon = statusCfg.icon;

                          return (
                            <div key={plan.id} className="rounded-lg border bg-card p-3 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate">{plan.clientName}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <Badge className={`text-[10px] ${statusCfg.color} border-0`}>
                                      <StatusIcon className="h-3 w-3 mr-0.5" />{statusCfg.label}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">{formatCurrency(paid)} / {formatCurrency(plan.totalAmount)}</Badge>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {canEdit && plan.status === 'en_cours' && (
                                    <Button size="sm" onClick={() => openInstallDialog(plan.id)} className="gap-1 text-xs">
                                      <Banknote className="h-3.5 w-3.5" /> Paiement
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}>
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Progress value={progress} className="h-2" />
                                <p className="text-[11px] text-muted-foreground">Reste: {formatCurrency(remaining)}</p>
                              </div>

                              {isExpanded && (
                                <div className="space-y-3">
                                  <Separator />

                                  {plan.scheduledTranches && plan.scheduledTranches.length > 0 && (
                                    <div className="space-y-1.5">
                                      <p className="text-xs font-semibold text-muted-foreground">Échéancier</p>
                                      {(() => {
                                        const alloc = getAllocationSummary(plan);
                                        return plan.scheduledTranches.map(tr => {
                                          const trAlloc = alloc.find(a => a.name === tr.name);
                                          const state = trAlloc?.status ?? 'unpaid';
                                          return (
                                            <div key={tr.id} className="flex items-center justify-between text-xs rounded-md border px-2 py-1.5">
                                              <span>{tr.name}</span>
                                              <span className="text-muted-foreground">
                                                {state === 'paid' ? 'Payé' : state === 'partial' ? `Avance ${formatCurrency(trAlloc?.paid || 0)}` : 'Non payé'}
                                                {' · '}
                                                {new Date(tr.dueDate).toLocaleDateString('fr-FR')}
                                              </span>
                                            </div>
                                          );
                                        });
                                      })()}
                                    </div>
                                  )}

                                  <div className="space-y-1.5">
                                    <p className="text-xs font-semibold text-muted-foreground">Historique ({plan.installments.length})</p>
                                    {plan.installments.length === 0 ? (
                                      <p className="text-xs text-muted-foreground italic">Aucun paiement enregistré</p>
                                    ) : (
                                      plan.installments
                                        .slice()
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map(inst => (
                                          <div key={inst.id} className="flex items-center justify-between text-xs rounded-md border px-2 py-1.5">
                                            <span className="font-medium text-success">{formatCurrency(inst.amount)}</span>
                                            <span className="text-muted-foreground">{new Date(inst.date).toLocaleDateString('fr-FR')} · {getMethodLabel(inst.paymentMethod, plan.departmentId)}</span>
                                          </div>
                                        ))
                                    )}
                                  </div>

                                  {canEdit && (
                                    <div className="flex gap-2 flex-wrap">
                                      {plan.status === 'en_cours' && progress >= 100 && (
                                        <Button size="sm" variant="outline" onClick={() => handleMarkComplete(plan.id)} className="gap-1 text-xs text-success">
                                          <CheckCircle2 className="h-3.5 w-3.5" /> Marquer terminé
                                        </Button>
                                      )}
                                      {plan.status === 'en_cours' && (
                                        <Button size="sm" variant="ghost" onClick={() => handleArchive(plan.id)} className="gap-1 text-xs text-muted-foreground">
                                          <Archive className="h-3.5 w-3.5" /> Archiver
                                        </Button>
                                      )}
                                      {(plan.status === 'termine' || plan.status === 'annule' || plan.status === 'archive') && (
                                        <Button size="sm" variant="outline" onClick={() => handleReopen(plan.id)} className="gap-1 text-xs">
                                          <ArchiveRestore className="h-3.5 w-3.5" /> Restaurer
                                        </Button>
                                      )}
                                      {(plan.status === 'termine' || plan.status === 'annule' || plan.status === 'archive') && (
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive hover:text-destructive">
                                              <Trash2 className="h-3.5 w-3.5" /> Supprimer
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Supprimer ce plan de suivi ?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Cette action est irréversible. Le plan de suivi de <strong>{plan.clientName}</strong> sera définitivement supprimé. L'action sera enregistrée dans le Super Audit.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                                              <AlertDialogAction onClick={() => handleDelete(plan)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                Supprimer
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {servicePlans.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">Plans de service</p>
              {servicePlans.map(plan => {
                const paid = getPaidAmount(plan);
                const remaining = getRemainingAmount(plan);
                const statusCfg = STATUS_CONFIG[plan.status];
                const StatusIcon = statusCfg.icon;
                return (
                  <Card key={plan.id} className={`border-0 shadow-sm ${focus === 'monthly-deficit' ? 'ring-1 ring-destructive/20' : ''}`}>
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{plan.label}</p>
                        <p className="text-xs text-muted-foreground">{plan.clientName} · {getDeptName(plan.departmentId)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${statusCfg.color} border-0`}>
                          <StatusIcon className="h-3 w-3 mr-0.5" />{statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{formatCurrency(paid)} / {formatCurrency(plan.totalAmount)}</Badge>
                        {canEdit && plan.status === 'en_cours' && (
                          <Button size="sm" onClick={() => openInstallDialog(plan.id)} className="gap-1 text-xs">
                            <Banknote className="h-3.5 w-3.5" /> Paiement
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground">Reste: {formatCurrency(remaining)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create plan dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau plan de paiement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du client *</Label>
                <Input placeholder="Ex: Jean Dupont" value={newClient} onChange={(e) => setNewClient(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label>Département *</Label>
                <Select value={newDept} onValueChange={(value) => {
                  setNewDept(value);
                  if (value === 'guims-educ') {
                    setNewGuimsEducMonthlyMode(true);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {accessibleDepts.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newDept === 'guims-educ' && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Mode parent mensuel (Guims Educ)</p>
                    <p className="text-xs text-muted-foreground">Le parent s'inscrit a une prestation et paie chaque mois.</p>
                  </div>
                  <Button
                    type="button"
                    variant={newGuimsEducMonthlyMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewGuimsEducMonthlyMode(v => !v)}
                  >
                    {newGuimsEducMonthlyMode ? 'Activé' : 'Activer'}
                  </Button>
                </div>
                {newGuimsEducMonthlyMode && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Catégorie *</Label>
                        <Input value={newGuimsEducCategory} onChange={(e) => setNewGuimsEducCategory(e.target.value)} placeholder="Ex: Vacances utiles" />
                      </div>
                      <div className="space-y-1">
                        <Label>Parent *</Label>
                        <Input value={newParentName} onChange={(e) => setNewParentName(e.target.value)} placeholder="Nom du parent" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Téléphone parent</Label>
                        <Input value={newParentPhone} onChange={(e) => setNewParentPhone(e.target.value)} placeholder="6XXXXXXXX" />
                      </div>
                      <div className="space-y-1">
                        <Label>Élève *</Label>
                        <Input value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="Nom de l'élève" />
                      </div>
                      <div className="space-y-1">
                        <Label>Classe/Niveau</Label>
                        <Input value={newStudentClass} onChange={(e) => setNewStudentClass(e.target.value)} placeholder="CM2, 3e, Terminale..." />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Mensualité (FCFA) *</Label>
                      <Input type="number" min="1" value={newMonthlyAmount} onChange={(e) => setNewMonthlyAmount(e.target.value)} placeholder="Ex: 25000" />
                    </div>
                    <div className="space-y-1">
                      <Label>Nombre de mois *</Label>
                      <Input type="number" min="1" max="36" value={newMonthlyMonths} onChange={(e) => setNewMonthlyMonths(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>1ère échéance *</Label>
                      <Input type="date" value={newMonthlyStartDate} onChange={(e) => setNewMonthlyStartDate(e.target.value)} />
                    </div>
                  </div>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Type *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setNewType('service')}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${newType === 'service' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40'}`}>
                  <p className="font-semibold text-sm">Service</p>
                  <p className="text-[11px] text-muted-foreground">Création site web, boost, etc.</p>
                </button>
                <button type="button" onClick={() => setNewType('formation')}
                  disabled={newDept === 'guims-educ' && newGuimsEducMonthlyMode}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${newType === 'formation' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40'}`}>
                  <p className="font-semibold text-sm">Formation</p>
                  <p className="text-[11px] text-muted-foreground">Avance sur formation, inscription partielle</p>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{newDept === 'guims-educ' ? 'Prestation *' : newType === 'service' ? 'Nom du service *' : 'Nom de la formation *'}</Label>
              <Input
                placeholder={newDept === 'guims-educ' ? "Ex: Cours a domicile Maths 3eme" : newType === 'service' ? "Ex: Création site web Restaurant Chez Jo" : "Ex: Formation Hanneton — Pack Gold"}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Montant total (FCFA) *</Label>
              <Input
                type="number"
                min="0"
                placeholder="Ex: 150000"
                value={newDept === 'guims-educ' && newGuimsEducMonthlyMode
                  ? String((parseInt(newMonthlyAmount || '0', 10) || 0) * (parseInt(newMonthlyMonths || '0', 10) || 0))
                  : newTotal}
                onChange={(e) => setNewTotal(e.target.value)}
                readOnly={newDept === 'guims-educ' && newGuimsEducMonthlyMode}
              />
            </div>
            {/* Scheduled tranches */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Échéancier (tranches avec dates limites)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addNewTranche} className="gap-1 text-xs h-7">
                  <Plus className="h-3 w-3" /> Ajouter une tranche
                </Button>
              </div>
              {newDept === 'guims-educ' && newGuimsEducMonthlyMode ? (
                <div className="rounded-lg border p-3 bg-muted/20 text-xs text-muted-foreground">
                  Les mensualités seront générées automatiquement a la création du plan.
                </div>
              ) : newTranches.length > 0 && (
                <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
                  {newTranches.map((tr, i) => (
                    <div key={i} className="grid grid-cols-[1fr_100px_130px_32px] gap-2 items-end">
                      <div>
                        {i === 0 && <Label className="text-[10px] text-muted-foreground">Nom</Label>}
                        <Input value={tr.name} onChange={(e) => updateNewTranche(i, 'name', e.target.value)} placeholder="Tranche 1" className="h-8 text-xs" />
                      </div>
                      <div>
                        {i === 0 && <Label className="text-[10px] text-muted-foreground">Montant</Label>}
                        <Input type="number" value={tr.amount} onChange={(e) => updateNewTranche(i, 'amount', e.target.value)} placeholder="50000" className="h-8 text-xs" />
                      </div>
                      <div>
                        {i === 0 && <Label className="text-[10px] text-muted-foreground">Date limite</Label>}
                        <Input type="date" value={tr.dueDate} onChange={(e) => updateNewTranche(i, 'dueDate', e.target.value)} className="h-8 text-xs" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeNewTranche(i)} className="h-8 w-8 text-destructive">
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">Le système enverra un rappel 24h avant et le jour de chaque échéance.</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Description / notes</Label>
              <Textarea placeholder="Détails du plan de paiement..." value={newDesc} onChange={(e) => setNewDesc(e.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreatePlan}>Créer le plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add installment dialog */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Show scheduled tranches as quick-select buttons */}
            {installPlanId && (() => {
              const plan = plans.find(p => p.id === installPlanId);
              if (!plan) return null;
              const paid = getPaidAmount(plan);
              const remaining = getRemainingAmount(plan);

              return (
                <>
                  <div className="rounded-md bg-muted/40 p-3 space-y-1">
                    <p className="text-xs font-medium">{plan.clientName} — {plan.label}</p>
                    <div className="flex gap-3 text-xs">
                      <span className="text-success">Payé : {formatCurrency(paid)}</span>
                      <span className="text-destructive">Reste : {formatCurrency(remaining)}</span>
                    </div>
                  </div>
                  {/* Quick-select: Inscription button if applicable */}
                  {plan.inscriptionFee && plan.inscriptionFee > 0 && (() => {
                    const insPaid = plan.inscriptionPaidAmount || (plan.inscriptionPaid ? plan.inscriptionFee : 0);
                    const insRemaining = plan.inscriptionFee - insPaid;
                    if (insRemaining <= 0) return null;
                    return (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Inscription</Label>
                        <button
                          type="button"
                          onClick={() => {
                            setInstallAmount(String(insRemaining));
                            setInstallNote('Inscription étudiant');
                          }}
                          className={`rounded-lg border-2 px-3 py-2 text-left text-xs transition-all w-full ${
                            installNote === 'Inscription étudiant' ? 'border-primary bg-primary/10 ring-2 ring-primary' :
                            'border-amber-300 bg-amber-50 dark:bg-amber-950/20 hover:border-primary/40'
                          }`}
                        >
                          <p className="font-semibold">Inscription</p>
                          <p>{formatCurrency(plan.inscriptionFee)}</p>
                          {insPaid > 0 ? (
                            <p className="text-[10px] text-amber-600">{formatCurrency(insPaid)} déjà payé — reste {formatCurrency(insRemaining)}</p>
                          ) : (
                            <p className="text-[10px] text-amber-600">Non payée — sera comptée séparément des tranches</p>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                  {plan.scheduledTranches && plan.scheduledTranches.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Sélectionner une tranche (ou saisir un montant libre)</Label>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const alloc = getAllocationSummary(plan);
                          return plan.scheduledTranches!.map(tr => {
                            const trAlloc = alloc.find(a => a.name === tr.name);
                            const isPaid = trAlloc?.status === 'paid';
                            const isPartial = trAlloc?.status === 'partial';
                            const isSelected = installNote === tr.name;
                            const suggestedAmount = isPartial ? trAlloc!.remaining : tr.amount;
                            return (
                              <button
                                key={tr.id}
                                type="button"
                                disabled={isPaid}
                                onClick={() => {
                                  if (!isSelected) setInstallAmount(String(suggestedAmount));
                                  setInstallNote(tr.name);
                                }}
                                className={`rounded-lg border-2 px-3 py-2 text-left text-xs transition-all ${
                                  isPaid ? 'border-green-200 bg-green-50 dark:bg-green-950/20 opacity-60 cursor-not-allowed' :
                                  isSelected ? 'border-primary bg-primary/10 ring-2 ring-primary' :
                                  isPartial ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 hover:border-primary/40' :
                                  'border-border hover:border-primary/40'
                                }`}
                              >
                                <p className="font-semibold">{tr.name}</p>
                                <p className={isPaid ? 'text-green-600' : isPartial ? 'text-amber-600' : ''}>
                                  {isPaid ? 'Payé ✓' : isPartial ? `Reste ${formatCurrency(trAlloc!.remaining)}` : formatCurrency(tr.amount)}
                                </p>
                                {isPartial && <p className="text-[10px] text-amber-600">Avance: {formatCurrency(trAlloc!.paid)}</p>}
                                {tr.dueDate && !isPaid && <p className="text-[10px] text-muted-foreground">{new Date(tr.dueDate).toLocaleDateString('fr-FR')}</p>}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="space-y-2">
              <Label>Montant (FCFA) *</Label>
              <Input type="number" min="1" placeholder="Ex: 50000" value={installAmount} onChange={(e) => setInstallAmount(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Saisissez le montant réel reçu. Le système répartira automatiquement sur les tranches.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Moyen de paiement</Label>
                <Select value={installMethod} onValueChange={setInstallMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {installPaymentMethods.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Input placeholder="Ex: Avance initiale, 2ème versement..." value={installNote} onChange={(e) => setInstallNote(e.target.value)} maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallOpen(false)}>Annuler</Button>
            <Button onClick={handleAddInstallment}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}
