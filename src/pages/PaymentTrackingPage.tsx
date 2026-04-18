import { useState, useEffect } from "react";
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
import { departments, type DepartmentId, type PaymentMethod, formatCurrency, PAYMENT_METHODS, addTransaction, isInscriptionCategory } from "@/lib/data";
import { addAuditEntry, addSuperAuditEntry, getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import {
  getPaymentPlans, addPaymentPlan, addInstallment, updatePaymentPlanStatus, deletePaymentPlan,
  getPaidAmount, getRemainingAmount, getPaymentReminders, getOverdueTranches, getAllocationSummary,
  updatePlanInscription,
  type PaymentPlan, type PaymentInstallment, type PaymentReminder, type ScheduledTranche,
} from "@/lib/stock";
import { toast } from "sonner";
import {
  CreditCard, Plus, Search, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, Archive, ArchiveRestore, Receipt, User, CalendarDays, Banknote, AlertTriangle, Bell, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STATUS_CONFIG = {
  en_cours: { label: "En cours", icon: Clock, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  termine: { label: "Terminé", icon: CheckCircle2, color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  annule: { label: "Annulé", icon: XCircle, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  archive: { label: "Archivé", icon: Archive, color: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400" },
};

export default function PaymentTrackingPage() {
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

  // Reminders
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [overdue, setOverdue] = useState<PaymentReminder[]>([]);

  // Add installment dialog
  const [installOpen, setInstallOpen] = useState(false);
  const [installPlanId, setInstallPlanId] = useState<string | null>(null);
  const [installAmount, setInstallAmount] = useState("");
  const [installDate, setInstallDate] = useState(new Date().toISOString().split('T')[0]);
  const [installMethod, setInstallMethod] = useState("especes");
  const [installNote, setInstallNote] = useState("");

  // Archive (no delete from suivi)

  const accessibleDepts = departments.filter(d => hasDepartmentAccess(currentUser, d.id));

  useEffect(() => { refresh(); }, []);

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

  // Stats — include inscription fees in totals for full picture
  const activePlans = plans.filter(p => p.status === 'en_cours');
  const totalDue = activePlans.reduce((s, p) => s + p.totalAmount + (p.inscriptionFee || 0), 0);
  const totalPaid = activePlans.reduce((s, p) => s + getPaidAmount(p) + (p.inscriptionPaidAmount || (p.inscriptionPaid && p.inscriptionFee ? p.inscriptionFee : 0)), 0);
  const totalRemaining = totalDue - totalPaid;

  const handleCreatePlan = () => {
    if (!newClient.trim()) { toast.error("Nom du client obligatoire"); return; }
    if (!newLabel.trim()) { toast.error("Libellé obligatoire"); return; }
    if (!newDept) { toast.error("Département obligatoire"); return; }
    const total = parseInt(newTotal);
    if (isNaN(total) || total <= 0) { toast.error("Montant total invalide"); return; }

    // Build scheduled tranches if any
    const scheduled: ScheduledTranche[] = newTranches
      .filter(t => t.name.trim() && t.amount && t.dueDate)
      .map(t => ({
        id: crypto.randomUUID(),
        name: t.name.trim(),
        amount: parseInt(t.amount) || 0,
        dueDate: t.dueDate,
      }))
      .filter(t => t.amount > 0);

    addPaymentPlan({
      departmentId: newDept as DepartmentId,
      clientName: newClient.trim(),
      planType: newType,
      label: newLabel.trim(),
      description: newDesc.trim() || undefined,
      totalAmount: total,
      createdBy: currentUser?.displayName ?? "Inconnu",
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
    setInstallDate(new Date().toISOString().split('T')[0]);
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
        date: installDate,
      });
      if (currentUser) {
        addAuditEntry({ userId: currentUser.id, username: currentUser.username, action: 'create', entityType: 'transaction', entityId: tx.id, details: `Inscription ${plan.clientName} — ${plan.label} : ${amount} FCFA (via suivi)`, previousData: '', newData: JSON.stringify({ type: 'income', amount, category: noteText, date: installDate, paymentMethod: installMethod }) });
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
        date: installDate,
      });
      if (currentUser) {
        addAuditEntry({ userId: currentUser.id, username: currentUser.username, action: 'create', entityType: 'transaction', entityId: tx.id, details: `Paiement ${plan.clientName} — ${plan.label} : ${amount} FCFA (via suivi)`, previousData: '', newData: JSON.stringify({ type: 'income', amount, category: noteText || 'Frais de formation', date: installDate, paymentMethod: installMethod }) });
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
  const getMethodLabel = (m: string) => PAYMENT_METHODS.find(pm => pm.value === m)?.label ?? m;

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

      {/* Reminders and overdue alerts */}
      {(reminders.length > 0 || overdue.length > 0) && (
        <div className="space-y-3">
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
        <div className="space-y-4">
          {filtered.map(plan => {
            const paid = getPaidAmount(plan);
            const remaining = getRemainingAmount(plan);
            const progress = plan.totalAmount > 0 ? Math.round((paid / plan.totalAmount) * 100) : 0;
            const isExpanded = expandedPlan === plan.id;
            const dept = departments.find(d => d.id === plan.departmentId);
            const statusCfg = STATUS_CONFIG[plan.status];
            const StatusIcon = statusCfg.icon;

            return (
              <Card key={plan.id} className="border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {dept && <img src={dept.logo} alt={dept.name} className="h-10 w-10 rounded-xl object-cover shadow-sm shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <CardTitle className="text-base sm:text-lg truncate">{plan.label}</CardTitle>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <Badge variant="secondary" className="text-[10px]">{getDeptName(plan.departmentId)}</Badge>
                          <Badge variant="outline" className="text-[10px]">{plan.planType === 'formation' ? 'Formation' : 'Service'}</Badge>
                          <Badge className={`text-[10px] ${statusCfg.color} border-0`}>
                            <StatusIcon className="h-3 w-3 mr-0.5" />{statusCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3" /> {plan.clientName}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {/* Inscription fee info */}
                  {plan.inscriptionFee && plan.inscriptionFee > 0 && (() => {
                    const paidAmt = plan.inscriptionPaidAmount || (plan.inscriptionPaid ? plan.inscriptionFee : 0);
                    const remaining = plan.inscriptionFee - paidAmt;
                    const isFullyPaid = remaining <= 0;
                    return (
                      <div className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs ${isFullyPaid ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'}`}>
                        <span className="flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 shrink-0" />
                          Inscription : {formatCurrency(plan.inscriptionFee)}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${isFullyPaid ? 'border-green-400 text-green-600' : 'border-amber-400 text-amber-600'}`}>
                          {isFullyPaid ? 'Payée ✓' : paidAmt > 0 ? `${formatCurrency(paidAmt)} payé — reste ${formatCurrency(remaining)}` : 'Non payée'}
                        </Badge>
                      </div>
                    );
                  })()}

                  {/* Total recap: inscription + formation */}
                  {plan.inscriptionFee && plan.inscriptionFee > 0 && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                      <span className="text-muted-foreground font-medium">Coût total (inscription + formation)</span>
                      <span className="font-bold">{formatCurrency(plan.inscriptionFee + plan.totalAmount)}</span>
                    </div>
                  )}

                  {/* Progress bar — formation fees only */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Formation</span>
                      <span className="font-semibold">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2.5" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-success font-medium">Payé : {formatCurrency(paid)}</span>
                      <span className="text-muted-foreground">/ {formatCurrency(plan.totalAmount)}</span>
                    </div>
                    {remaining > 0 && plan.status === 'en_cours' && (
                      <p className="text-xs text-destructive font-medium">Reste : {formatCurrency(remaining)}</p>
                    )}
                  </div>

                  {/* Next tranche + last payment info */}
                  {plan.status === 'en_cours' && (
                    <div className="flex flex-col gap-2 text-xs">
                      {/* Allocation per tranche */}
                      {plan.scheduledTranches && plan.scheduledTranches.length > 0 && (() => {
                        const alloc = getAllocationSummary(plan);
                        const nextUnpaid = alloc.find(a => a.status !== 'paid');
                        if (!nextUnpaid) return null;
                        const trancheObj = plan.scheduledTranches!.find(t => t.name === nextUnpaid.name);
                        const today = new Date().toISOString().split('T')[0];
                        const isOverdue = trancheObj?.dueDate ? trancheObj.dueDate < today : false;
                        return (
                          <div className="space-y-1.5">
                            <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${isOverdue ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400'}`}>
                              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                <strong>{nextUnpaid.name}</strong> — {formatCurrency(nextUnpaid.expected)}
                                {nextUnpaid.status === 'partial' && ` (avance: ${formatCurrency(nextUnpaid.paid)}, reste: ${formatCurrency(nextUnpaid.remaining)})`}
                                {trancheObj?.dueDate && (isOverdue
                                  ? ` · en retard (${new Date(trancheObj.dueDate).toLocaleDateString('fr-FR')})`
                                  : ` · échéance le ${new Date(trancheObj.dueDate).toLocaleDateString('fr-FR')}`
                                )}
                              </span>
                            </div>
                            {alloc.filter(a => a.status === 'paid').length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pl-1">
                                {alloc.filter(a => a.status === 'paid').map(a => (
                                  <Badge key={a.name} variant="outline" className="text-[10px] border-green-300 text-green-600 dark:text-green-400">
                                    {a.name} ✓
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* Last payment date */}
                      {plan.installments.length > 0 && (() => {
                        const last = [...plan.installments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                        return (
                          <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>Dernier paiement : {formatCurrency(last.amount)} le {new Date(last.date).toLocaleDateString('fr-FR')}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Action buttons */}
                  {plan.status === 'en_cours' && canEdit && (
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => openInstallDialog(plan.id)} className="gap-1 text-xs">
                        <Banknote className="h-3.5 w-3.5" /> Enregistrer un paiement
                      </Button>
                      {progress >= 100 && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkComplete(plan.id)} className="gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Marquer terminé
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleArchive(plan.id)} className="gap-1 text-xs text-muted-foreground">
                        <Archive className="h-3.5 w-3.5" /> Archiver
                      </Button>
                    </div>
                  )}
                  {(plan.status === 'termine' || plan.status === 'annule' || plan.status === 'archive') && canEdit && (
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => handleReopen(plan.id)} className="gap-1 text-xs">
                        <ArchiveRestore className="h-3.5 w-3.5" /> Restaurer
                      </Button>
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
                    </div>
                  )}

                  {/* Expanded: scheduled tranches + payment history */}
                  {isExpanded && (
                    <>
                      {/* Full breakdown: inscription + scheduled tranches */}
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          Détail des paiements
                        </p>
                        <div className="space-y-1.5">
                          {/* Inscription row (if applicable) */}
                          {plan.inscriptionFee && plan.inscriptionFee > 0 && (() => {
                            const paidAmt = plan.inscriptionPaidAmount || (plan.inscriptionPaid ? plan.inscriptionFee : 0);
                            const remaining = plan.inscriptionFee - paidAmt;
                            const isFullyPaid = remaining <= 0;
                            return (
                              <div className={`flex items-center justify-between rounded-md border p-2 text-xs ${isFullyPaid ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'}`}>
                                <div className="flex items-center gap-2">
                                  {isFullyPaid ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Clock className="h-3.5 w-3.5 text-amber-600" />}
                                  <span className="font-medium">Inscription</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{formatCurrency(plan.inscriptionFee)}</span>
                                  {isFullyPaid
                                    ? <Badge className="text-[9px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">Payé</Badge>
                                    : paidAmt > 0
                                      ? <Badge className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">{formatCurrency(paidAmt)} payé — reste {formatCurrency(remaining)}</Badge>
                                      : <Badge className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Non payé</Badge>
                                  }
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Scheduled tranches timeline */}
                      {plan.scheduledTranches && plan.scheduledTranches.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Échéancier ({plan.scheduledTranches.length} tranche{plan.scheduledTranches.length > 1 ? 's' : ''})
                          </p>
                            <div className="space-y-1.5">
                              {(() => {
                                const alloc = getAllocationSummary(plan);
                                return plan.scheduledTranches!.map((tr) => {
                                  const today = new Date().toISOString().split('T')[0];
                                  const isPast = tr.dueDate < today;
                                  const trAlloc = alloc.find(a => a.name === tr.name);
                                  const isPaid = trAlloc?.status === 'paid';
                                  const isPartial = trAlloc?.status === 'partial';
                                  const isOverdue = isPast && !isPaid;
                                  return (
                                    <div key={tr.id} className={`flex items-center justify-between rounded-md border p-2 text-xs ${isPaid ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : isOverdue ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : isPartial ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-muted/30'}`}>
                                      <div className="flex items-center gap-2">
                                        {isPaid ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : isOverdue ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> : isPartial ? <Clock className="h-3.5 w-3.5 text-amber-600" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                                        <span className="font-medium">{tr.name}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">{formatCurrency(tr.amount)}</span>
                                        {isPartial && trAlloc && (
                                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                                            avance {formatCurrency(trAlloc.paid)}
                                          </span>
                                        )}
                                        <span className={`${isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                          {new Date(tr.dueDate).toLocaleDateString('fr-FR')}
                                        </span>
                                        {isPaid && <Badge className="text-[9px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">Payé</Badge>}
                                        {isPartial && <Badge className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Avance</Badge>}
                                        {isOverdue && !isPartial && <Badge className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Retard</Badge>}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                      )}
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Receipt className="h-3 w-3" />
                          Historique des paiements ({plan.installments.length})
                        </p>
                        {plan.installments.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Aucun paiement enregistré</p>
                        ) : (
                          <div className="space-y-2">
                            {plan.installments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((inst, idx) => (
                              <div key={inst.id} className="rounded-md border bg-muted/30 p-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-success">{formatCurrency(inst.amount)}</span>
                                    <Badge variant="outline" className="text-[10px]">{getMethodLabel(inst.paymentMethod)}</Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <CalendarDays className="h-3 w-3" />
                                    {new Date(inst.date).toLocaleDateString('fr-FR')}
                                    {inst.note && <span className="ml-1">— {inst.note}</span>}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">Par {inst.recordedBy}</p>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">#{plan.installments.length - idx}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {plan.description && (
                        <>
                          <Separator />
                          <p className="text-xs text-muted-foreground">{plan.description}</p>
                        </>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        Créé le {new Date(plan.createdAt).toLocaleDateString('fr-FR')} par {plan.createdBy}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
                <Select value={newDept} onValueChange={setNewDept}>
                  <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {accessibleDepts.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setNewType('service')}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${newType === 'service' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40'}`}>
                  <p className="font-semibold text-sm">Service</p>
                  <p className="text-[11px] text-muted-foreground">Création site web, boost, etc.</p>
                </button>
                <button type="button" onClick={() => setNewType('formation')}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${newType === 'formation' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40'}`}>
                  <p className="font-semibold text-sm">Formation</p>
                  <p className="text-[11px] text-muted-foreground">Avance sur formation, inscription partielle</p>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{newType === 'service' ? 'Nom du service *' : 'Nom de la formation *'}</Label>
              <Input
                placeholder={newType === 'service' ? "Ex: Création site web Restaurant Chez Jo" : "Ex: Formation Hanneton — Pack Gold"}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Montant total (FCFA) *</Label>
              <Input type="number" min="0" placeholder="Ex: 150000" value={newTotal} onChange={(e) => setNewTotal(e.target.value)} />
            </div>
            {/* Scheduled tranches */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Échéancier (tranches avec dates limites)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addNewTranche} className="gap-1 text-xs h-7">
                  <Plus className="h-3 w-3" /> Ajouter une tranche
                </Button>
              </div>
              {newTranches.length > 0 && (
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
                    {PAYMENT_METHODS.map(m => (
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
