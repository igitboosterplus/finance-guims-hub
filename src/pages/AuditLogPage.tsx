import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditIntegrityStatus, getAuditLog, markAuditEntriesSeen, buildHumanDiff, type AuditLogEntry } from "@/lib/auth";
import { getStatsByPaymentMethod, getTransactions } from "@/lib/data";
import { getTransactionTimestamp } from "@/lib/transactionDates";
import { downloadAuditReport } from "@/lib/reports";
import { useAuth } from "@/hooks/useAuth";
import { Download, Search, FileText, PenLine, Trash2, Plus, Shield, ChevronLeft, ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
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
};

const actionColors: Record<string, string> = {
  create: 'bg-success/10 text-success border-success/30',
  update: 'bg-warning/10 text-warning border-warning/30',
  delete: 'bg-destructive/10 text-destructive border-destructive/30',
};

export default function AuditLogPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus") || "";
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const integrity = getAuditIntegrityStatus();

  const txs = getTransactions();

  useEffect(() => {
    const log = getAuditLog();
    setEntries(log);
    if (user?.role === 'superadmin') {
      markAuditEntriesSeen();
    }
  }, [user]);

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

  if (!user || user.role !== 'superadmin') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg">Accès réservé au Super Admin</p>
      </div>
    );
  }

  const filtered = entries
    .filter(e => {
      const q = search.toLowerCase();
      return !q ||
        e.username.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q) ||
        actionLabels[e.action]?.toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const duplicateCases = (() => {
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
  })();

  const unusualExpensesCases = (() => {
    const now = new Date();
    const monthExpenses = txs.filter((tx) => {
      if (tx.type !== "expense") return false;
      const d = new Date(getTransactionTimestamp(tx.date));
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const avg = monthExpenses.length > 0 ? monthExpenses.reduce((sum, tx) => sum + tx.amount, 0) / monthExpenses.length : 0;
    return monthExpenses.filter(tx => avg > 0 && tx.amount >= avg * 2).slice(0, 5);
  })();

  const cashConcentrationCase = (() => {
    const stats = getStatsByPaymentMethod();
    const totalFlow = stats.reduce((sum, item) => sum + item.income + item.expenses, 0);
    const leader = [...stats].sort((a, b) => (b.income + b.expenses) - (a.income + a.expenses))[0];
    if (!leader || totalFlow <= 0) return null;
    const share = Math.round(((leader.income + leader.expenses) / totalFlow) * 100);
    return { leader, share };
  })();

  const handleExport = async () => {
    await downloadAuditReport();
    toast.success("Rapport d'audit généré");
  };

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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(entry => {
                    const Icon = actionIcons[entry.action] || FileText;
                    const readableDetails = entry.action === 'update' && entry.previousData && entry.newData
                      ? buildHumanDiff(entry.previousData, entry.newData)
                      : entry.details;
                    return (
                      <TableRow key={entry.id} className={!entry.seen ? 'bg-primary/5' : ''}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{entry.username}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={actionColors[entry.action]}>
                            <Icon className="h-3 w-3 mr-1" />
                            {actionLabels[entry.action]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[350px]">
                          <span className="whitespace-pre-wrap break-words">{readableDetails || entry.details}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                          {entry.justification ? (
                            <span className="italic">{entry.justification}</span>
                          ) : '—'}
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
