import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addAuditEntry, getAuditIntegrityStatus, getAuditLog, getCurrentUser, hasPermission, markAuditEntriesSeen, buildHumanDiff, type AuditLogEntry } from "@/lib/auth";
import { addTransaction, getStatsByPaymentMethod, getTransactions, type PaymentMethod, type Transaction } from "@/lib/data";
import { pushAllToSupabase } from "@/lib/sync";
import { getTransactionTimestamp } from "@/lib/transactionDates";
import { downloadAuditReport } from "@/lib/reports";
import { useAuth } from "@/hooks/useAuth";
import { Download, Search, FileText, PenLine, Trash2, Plus, Shield, ChevronLeft, ChevronRight, ShieldAlert, ShieldCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

const PAGE_SIZE = 20;

const actionIcons: Record<string, typeof Plus> = {
  create: Plus,
  update: PenLine,
  delete: Trash2,
};

const actionLabels: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  delete_transaction: 'Suppression',
};

const actionColors: Record<string, string> = {
  create: 'bg-success/10 text-success border-success/30',
  update: 'bg-warning/10 text-warning border-warning/30',
  delete: 'bg-destructive/10 text-destructive border-destructive/30',
  delete_transaction: 'bg-destructive/10 text-destructive border-destructive/30',
};

function isDeleteLikeAction(action: string): boolean {
  const normalized = action.toLowerCase();
  return normalized === 'delete' || normalized === 'delete_transaction' || normalized.includes('delete') || normalized.includes('suppression');
}

function safeParseAuditPayload(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') {
      return safeParseAuditPayload(parsed);
    }
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    // Legacy fallback: attempt a best-effort conversion from single-quoted pseudo JSON.
    const normalized = value.replace(/'/g, '"');
    try {
      const parsed = JSON.parse(normalized);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
}

function parseAmountFromAuditDetails(details: string): number {
  const withFcfa = details.match(/([\d\s.,]+)\s*FCFA/i);
  if (withFcfa?.[1]) {
    const normalized = withFcfa[1].replace(/\s/g, '').replace(/,/g, '.');
    const amount = Number(normalized);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  const generic = details.match(/([\d\s]{3,})/);
  if (generic?.[1]) {
    const amount = Number(generic[1].replace(/\s/g, ''));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function parseAuditAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function getAuditSignedAmount(payload: Record<string, unknown>): number | null {
  const rawAmount = parseAuditAmount(payload.amount);
  if (rawAmount === null) return null;
  return payload.type === 'expense' ? -rawAmount : rawAmount;
}

function formatSignedAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toLocaleString('fr-FR');
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${abs} FCFA`;
}

function formatRawAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('fr-FR')} FCFA`;
}

function getAuditFieldText(payload: Record<string, unknown>, key: 'personName' | 'category'): string {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '—';
}

type AuditUpdateSummary = {
  beforeLine: string;
  afterLine: string;
  beforeAmount: number | null;
  afterAmount: number | null;
  beforeRawAmount: number | null;
  afterRawAmount: number | null;
  impact: number | null;
  readableDiff: string;
};

function buildAuditUpdateSummary(entry: AuditLogEntry): AuditUpdateSummary | null {
  if (entry.action !== 'update' || !entry.previousData || !entry.newData) return null;
  const previousRaw = safeParseAuditPayload(entry.previousData);
  const newRaw = safeParseAuditPayload(entry.newData);

  const beforeAmount = getAuditSignedAmount(previousRaw);
  const afterAmount = getAuditSignedAmount(newRaw);
  const beforeRawAmount = parseAuditAmount(previousRaw.amount);
  const afterRawAmount = parseAuditAmount(newRaw.amount);
  const beforeType = previousRaw.type === 'expense' ? 'Dépense' : 'Revenu';
  const afterType = newRaw.type === 'expense' ? 'Dépense' : 'Revenu';
  const impact = beforeAmount !== null && afterAmount !== null ? afterAmount - beforeAmount : null;

  const beforeLine = `${getAuditFieldText(previousRaw, 'personName')} · ${getAuditFieldText(previousRaw, 'category')} · ${beforeType} · ${formatRawAmount(beforeRawAmount)}`;
  const afterLine = `${getAuditFieldText(newRaw, 'personName')} · ${getAuditFieldText(newRaw, 'category')} · ${afterType} · ${formatRawAmount(afterRawAmount)}`;
  const readableDiff = buildHumanDiff(entry.previousData, entry.newData);

  return {
    beforeLine,
    afterLine,
    beforeAmount,
    afterAmount,
    beforeRawAmount,
    afterRawAmount,
    impact,
    readableDiff,
  };
}

function isAmountCorrectionUpdate(entry: AuditLogEntry): boolean {
  if (entry.action !== 'update' || !entry.previousData || !entry.newData) return false;
  const previousRaw = safeParseAuditPayload(entry.previousData);
  const newRaw = safeParseAuditPayload(entry.newData);
  const previousAmount = parseAuditAmount(previousRaw.amount);
  const newAmount = parseAuditAmount(newRaw.amount);
  if (previousAmount === null || newAmount === null) return false;
  return previousAmount !== newAmount;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const canViewAudit = hasPermission(user, 'canViewAudit');
  const canRestoreAuditEntries = hasPermission(user, 'canRestoreAuditEntries');
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus") || "";
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [amountCorrectionsOnly, setAmountCorrectionsOnly] = useState(false);
  const [actionFilter, setActionFilter] = useState<'all' | 'create' | 'update' | 'delete'>('all');
  const [page, setPage] = useState(1);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const integrity = getAuditIntegrityStatus();

  const txs = useMemo(() => getTransactions(), [entries.length]);

  useEffect(() => {
    const log = getAuditLog();
    setEntries(log);
    if (canViewAudit) {
      markAuditEntriesSeen();
    }
  }, [canViewAudit]);

  useEffect(() => {
    if (focus === "dup-tx") {
      setSearch("création");
      setPage(1);
    } else if (focus === "unusual-expenses") {
      setSearch("dépense");
      setPage(1);
    } else if (focus === "cash-concentration") {
      setSearch("");
      setPage(1);
    }
  }, [focus]);

  const filtered = useMemo(() => {
    return entries
      .filter(e => {
        if (actionFilter !== 'all' && e.action !== actionFilter) {
          return false;
        }
        if (amountCorrectionsOnly && !isAmountCorrectionUpdate(e)) {
          return false;
        }
        const q = search.toLowerCase();
        return !q ||
          e.username.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q) ||
          actionLabels[e.action]?.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [entries, search, amountCorrectionsOnly, actionFilter]);

  const auditSummary = useMemo(() => {
    let updateCount = 0;
    let amountCorrections = 0;
    let updateImpact = 0;
    let missingJustificationOnUpdates = 0;

    for (const entry of filtered) {
      if (entry.action !== 'update') continue;
      updateCount += 1;
      if (!entry.justification || !entry.justification.trim()) {
        missingJustificationOnUpdates += 1;
      }

      const summary = buildAuditUpdateSummary(entry);
      if (summary?.impact !== null) {
        updateImpact += summary.impact;
      }
      if (isAmountCorrectionUpdate(entry)) {
        amountCorrections += 1;
      }
    }

    return {
      updateCount,
      amountCorrections,
      updateImpact,
      missingJustificationOnUpdates,
    };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const duplicateCases = useMemo(() => {
    const grouped = new Map<string, { count: number; person: string; amount: number; date: string; category: string }>();
    for (const tx of txs) {
      const day = new Date(getTransactionTimestamp(tx.date)).toISOString().slice(0, 10);
      const key = `${day}|${tx.type}|${tx.departmentId}|${tx.category}|${tx.personName}|${tx.amount}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, { count: 1, person: tx.personName || "—", amount: tx.amount, date: tx.date, category: tx.category });
      }
    }
    return [...grouped.values()].filter(item => item.count > 1).slice(0, 5);
  }, [txs]);

  const unusualExpensesCases = useMemo(() => {
    const now = new Date();
    const monthExpenses = txs.filter((tx) => {
      if (tx.type !== "expense") return false;
      const d = new Date(getTransactionTimestamp(tx.date));
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const avg = monthExpenses.length > 0 ? monthExpenses.reduce((sum, tx) => sum + tx.amount, 0) / monthExpenses.length : 0;
    return monthExpenses.filter(tx => avg > 0 && tx.amount >= avg * 2).slice(0, 5);
  }, [txs]);

  const cashConcentrationCase = useMemo(() => {
    const stats = getStatsByPaymentMethod();
    const totalFlow = stats.reduce((sum, item) => sum + item.income + item.expenses, 0);
    const leader = [...stats].sort((a, b) => (b.income + b.expenses) - (a.income + a.expenses))[0];
    if (!leader || totalFlow <= 0) return null;
    const share = Math.round(((leader.income + leader.expenses) / totalFlow) * 100);
    return { leader, share };
  }, [entries.length]);

  const restoredDeleteAuditIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) {
      if (e.action !== 'create' || e.entityType !== 'transaction') continue;
      if (!e.newData) continue;
      try {
        const raw = JSON.parse(e.newData) as Record<string, unknown>;
        const sourceId = typeof raw.restoredFromAuditId === 'string' ? raw.restoredFromAuditId : '';
        if (sourceId) ids.add(sourceId);
      } catch {
        // Ignore malformed historical payloads
      }
    }
    return ids;
  }, [entries]);

  const handleExport = async () => {
    await downloadAuditReport();
    toast.success("Rapport d'audit généré");
  };

  const buildRestoredTransaction = (entry: AuditLogEntry): Omit<Transaction, 'id' | 'createdAt'> | null => {
    const previousRaw = safeParseAuditPayload(entry.previousData);
    const newRaw = safeParseAuditPayload(entry.newData);
    const raw = Object.keys(previousRaw).length > 0 ? previousRaw : newRaw;

    const fallbackCategory = entry.details.includes('Suppression:')
      ? entry.details.replace('Suppression:', '').trim().split(' - ')[0]?.trim() || 'Autres revenus'
      : 'Autres revenus';

    const fallbackDescription = entry.details.includes(' - ')
      ? entry.details.split(' - ').slice(1).join(' - ').trim()
      : `Restauration audit ${entry.id}`;

    const amount = Number(raw.amount ?? parseAmountFromAuditDetails(entry.details));
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const type = raw.type === 'expense' ? 'expense' : 'income';
    const paymentMethod = (typeof raw.paymentMethod === 'string' ? raw.paymentMethod : 'especes') as PaymentMethod;

    return {
      departmentId: (typeof raw.departmentId === 'string' ? raw.departmentId : 'charges-entreprise') as Transaction['departmentId'],
      type,
      paymentMethod,
      category: typeof raw.category === 'string' && raw.category.trim() ? raw.category : fallbackCategory,
      personName: typeof raw.personName === 'string' && raw.personName.trim() ? raw.personName : 'Restauration audit',
      phoneNumber: typeof raw.phoneNumber === 'string' && raw.phoneNumber.trim() ? raw.phoneNumber : undefined,
      description: typeof raw.description === 'string' && raw.description.trim() ? raw.description : fallbackDescription,
      amount,
      date: typeof raw.date === 'string' && raw.date ? raw.date : entry.timestamp,
    };
  };

  const isRestorableDelete = (entry: AuditLogEntry): boolean => {
    if (!isDeleteLikeAction(String(entry.action ?? ''))) return false;
    if (restoredDeleteAuditIds.has(entry.id)) return true;
    if (entry.entityType === 'transaction') return true;

    const payload = safeParseAuditPayload(entry.previousData);
    const hasTxShape = Boolean(payload.type || payload.paymentMethod || payload.category || payload.amount || payload.date);
    const detailsLooksLikeDelete = /suppression|delete/i.test(entry.details);
    return hasTxShape && detailsLooksLikeDelete;
  };

  const handleRestore = async (entry: AuditLogEntry) => {
    if (!canRestoreAuditEntries) {
      toast.error("Vous n'avez pas le droit de restaurer depuis l'audit.");
      return;
    }
    if (restoringId) return;
    if (restoredDeleteAuditIds.has(entry.id)) {
      toast.info('Cette suppression a deja ete restauree.');
      return;
    }
    const restored = buildRestoredTransaction(entry);
    if (!restored) {
      toast.error('Impossible de restaurer: donnees insuffisantes dans l\'audit.');
      return;
    }

    const confirmed = window.confirm('Confirmer la restauration de cette transaction supprimee ?');
    if (!confirmed) return;

    setRestoringId(entry.id);
    try {
      const tx = addTransaction(restored);
      await pushAllToSupabase();
      const persisted = getTransactions().some(item => item.id === tx.id);
      if (!persisted) {
        throw new Error('Transaction non persistée après synchronisation');
      }
      const current = getCurrentUser();
      if (current) {
        addAuditEntry({
          userId: current.id,
          username: current.username,
          action: 'create',
          entityType: 'transaction',
          entityId: tx.id,
          details: `Restauration depuis audit #${entry.id}: ${tx.category} - ${tx.description}`,
          previousData: '',
          newData: JSON.stringify({
            type: tx.type,
            amount: tx.amount,
            category: tx.category,
            date: tx.date,
            paymentMethod: tx.paymentMethod,
            restoredFromAuditId: entry.id,
          }),
        });
      }
      setEntries(getAuditLog());
      toast.success('Transaction restauree depuis le journal d\'audit');
    } catch {
      toast.error('Echec de restauration. Reessayez.');
    } finally {
      setRestoringId(null);
    }
  };

  if (!user || !canViewAudit) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg">Accès réservé au Super Admin</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            Journal d'audit
          </h2>
          <p className="text-sm text-muted-foreground">{entries.length} entrée{entries.length > 1 ? 's' : ''} enregistrée{entries.length > 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2 self-start sm:self-auto">
          <Download className="h-4 w-4" />
          Rapport PDF
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher dans le journal..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant={actionFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setActionFilter('all'); setPage(1); }}
        >
          Toutes les actions
        </Button>
        <Button
          type="button"
          variant={actionFilter === 'update' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setActionFilter('update'); setPage(1); }}
        >
          Modifications
        </Button>
        <Button
          type="button"
          variant={actionFilter === 'create' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setActionFilter('create'); setPage(1); }}
        >
          Créations
        </Button>
        <Button
          type="button"
          variant={actionFilter === 'delete' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setActionFilter('delete'); setPage(1); }}
        >
          Suppressions
        </Button>
        <Button
          type="button"
          variant={amountCorrectionsOnly ? "default" : "outline"}
          size="sm"
          onClick={() => { setAmountCorrectionsOnly(v => !v); setPage(1); }}
        >
          Corrections de montant uniquement
        </Button>
        {amountCorrectionsOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setAmountCorrectionsOnly(false); setPage(1); }}
          >
            Retirer le filtre
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Modifications visibles</p>
            <p className="text-lg font-semibold">{auditSummary.updateCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Corrections de montant</p>
            <p className="text-lg font-semibold">{auditSummary.amountCorrections}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Impact net des modifications</p>
            <p className={`text-lg font-semibold ${auditSummary.updateImpact >= 0 ? 'text-success' : 'text-destructive'}`}>
              {auditSummary.updateImpact >= 0 ? '+' : ''}{auditSummary.updateImpact.toLocaleString('fr-FR')} FCFA
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Modifs sans justification</p>
            <p className={`text-lg font-semibold ${auditSummary.missingJustificationOnUpdates > 0 ? 'text-warning' : 'text-foreground'}`}>
              {auditSummary.missingJustificationOnUpdates}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            {integrity.audit.ok ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
            <span>
              Intégrité journal audit: {integrity.audit.ok ? 'valide' : 'altération détectée'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Journal append-only: suppression désactivée</p>
        </CardContent>
      </Card>

      {focus === "dup-tx" && duplicateCases.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cas signalés: doublons potentiels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {duplicateCases.map((item, index) => (
              <div key={index} className="rounded border border-destructive/30 px-2 py-1">
                {item.person} · {item.category} · {item.count} occurrences · {new Date(item.date).toLocaleDateString('fr-FR')} · {item.amount.toLocaleString('fr-FR')} FCFA
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {focus === "unusual-expenses" && unusualExpensesCases.length > 0 && (
        <Card className="border-amber-400/40 bg-amber-50/70 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cas signalés: dépenses atypiques</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {unusualExpensesCases.map((item) => (
              <div key={item.id} className="rounded border border-amber-400/40 px-2 py-1">
                {new Date(item.date).toLocaleDateString('fr-FR')} · {item.personName || '—'} · {item.category} · {item.amount.toLocaleString('fr-FR')} FCFA
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {focus === "cash-concentration" && cashConcentrationCase && (
        <Card className="border-amber-400/40 bg-amber-50/70 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cas signalé: concentration de flux</CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            La caisse {cashConcentrationCase.leader.label} concentre {cashConcentrationCase.share}% des flux. Action recommandée: revue des opérations et répartition des encaissements.
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Aucune entrée dans le journal</p>
        </div>
      ) : (
        <>
          <Card className="border-0 shadow-md overflow-x-auto">
            <CardContent className="p-0">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead>Justification</TableHead>
                    <TableHead>Restauration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(entry => {
                    const normalizedAction = String(entry.action ?? '').toLowerCase();
                    const Icon = actionIcons[normalizedAction] || FileText;
                    const updateSummary = buildAuditUpdateSummary(entry);
                    const readableDetails = normalizedAction === 'update' && entry.previousData && entry.newData
                      ? buildHumanDiff(entry.previousData, entry.newData)
                      : entry.details;
                    return (
                      <TableRow key={entry.id} className={!entry.seen ? 'bg-primary/5' : ''}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{entry.username}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={actionColors[normalizedAction] || actionColors.delete}>
                            <Icon className="h-3 w-3 mr-1" />
                            {actionLabels[normalizedAction] || entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[420px]">
                          {updateSummary ? (
                            <div className="space-y-1.5">
                              <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1">
                                <p className="text-[11px] text-muted-foreground">Avant</p>
                                <p className="text-xs font-medium break-words">{updateSummary.beforeLine}</p>
                              </div>
                              <div className="rounded-md border border-success/30 bg-success/5 px-2 py-1">
                                <p className="text-[11px] text-muted-foreground">Après</p>
                                <p className="text-xs font-medium break-words">{updateSummary.afterLine}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {updateSummary.beforeRawAmount !== null && updateSummary.afterRawAmount !== null && (
                                  <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10">
                                    Montant saisi: {formatRawAmount(updateSummary.beforeRawAmount)} {'->'} {formatRawAmount(updateSummary.afterRawAmount)}
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className={updateSummary.impact === null
                                    ? 'text-muted-foreground border-muted-foreground/30'
                                    : updateSummary.impact >= 0
                                      ? 'text-success border-success/30 bg-success/10'
                                      : 'text-destructive border-destructive/30 bg-destructive/10'}
                                >
                                  Impact solde: {formatSignedAmount(updateSummary.impact)}
                                </Badge>
                                {entry.justification ? (
                                  <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
                                    Justifiée
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
                                    Sans justification
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{updateSummary.readableDiff || readableDetails || entry.details}</p>
                            </div>
                          ) : (
                            <span className="whitespace-pre-wrap break-words">{readableDetails || entry.details}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                          {entry.justification ? (
                            <span className="italic">{entry.justification}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {isRestorableDelete(entry) && canRestoreAuditEntries ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1"
                              onClick={() => handleRestore(entry)}
                              disabled={restoringId === entry.id || restoredDeleteAuditIds.has(entry.id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              {restoredDeleteAuditIds.has(entry.id) ? 'Restauree' : 'Restaurer'}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {filtered.length} entrée{filtered.length > 1 ? 's' : ''} — Page {currentPage}/{totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
