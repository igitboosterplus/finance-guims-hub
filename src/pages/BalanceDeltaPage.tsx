import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGlobalStats, getTransactions, formatCurrency } from "@/lib/data";
import { buildHumanDiff, getAuditLog, getCurrentSession, type AuditLogEntry } from "@/lib/auth";
import { getTransactionTimestamp } from "@/lib/transactionDates";
import { ArrowDownRight, ArrowUpRight, LineChart } from "lucide-react";

type DeltaScope = "session" | "day" | "range";

const toDateInputValue = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseLocalDate = (value: string, endOfDay = false): Date | null => {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = endOfDay
    ? new Date(y, m, d, 23, 59, 59, 999)
    : new Date(y, m, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const actionLabels: Record<string, string> = {
  create: "Création",
  update: "Modification",
  delete: "Suppression",
};

function safeParseAuditPayload(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function getTransactionImpact(payload: Record<string, unknown>): number | null {
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const type = payload.type === "expense" ? "expense" : "income";
  return type === "income" ? amount : -amount;
}

function formatAuditAmount(value?: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCurrency(amount) : "—";
}

function getAuditUpdateImpact(entry: AuditLogEntry): number | null {
  if (entry.action !== "update") return null;
  const previousRaw = safeParseAuditPayload(entry.previousData);
  const newRaw = safeParseAuditPayload(entry.newData);
  const before = getTransactionImpact(previousRaw);
  const after = getTransactionImpact(newRaw);
  if (before === null || after === null) return null;
  return after - before;
}

function getAuditEntryLabel(entry: AuditLogEntry): string {
  const previousRaw = safeParseAuditPayload(entry.previousData);
  const newRaw = safeParseAuditPayload(entry.newData);
  const raw = Object.keys(newRaw).length > 0 ? newRaw : previousRaw;
  const category = typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : "Transaction";
  const personName = typeof raw.personName === "string" && raw.personName.trim() ? raw.personName.trim() : "Sans nom";
  return `${category} — ${personName}`;
}

function getAuditUpdateSummary(entry: AuditLogEntry): string {
  const previousRaw = safeParseAuditPayload(entry.previousData);
  const newRaw = safeParseAuditPayload(entry.newData);
  const previousAmount = formatAuditAmount(previousRaw.amount);
  const newAmount = formatAuditAmount(newRaw.amount);
  const previousCategory = typeof previousRaw.category === "string" && previousRaw.category.trim() ? previousRaw.category.trim() : "Catégorie inconnue";
  const newCategory = typeof newRaw.category === "string" && newRaw.category.trim() ? newRaw.category.trim() : previousCategory;
  const previousPerson = typeof previousRaw.personName === "string" && previousRaw.personName.trim() ? previousRaw.personName.trim() : "Sans nom";
  const newPerson = typeof newRaw.personName === "string" && newRaw.personName.trim() ? newRaw.personName.trim() : previousPerson;
  const readableDiff = buildHumanDiff(entry.previousData || "{}", entry.newData || "{}");

  return `${previousPerson} / ${previousCategory} / ${previousAmount} -> ${newPerson} / ${newCategory} / ${newAmount}${readableDiff ? ` | ${readableDiff}` : ""}`;
}

type ModificationImpact = {
  entry: AuditLogEntry;
  impact: number;
};

type ModificationGroup = {
  entityId: string;
  label: string;
  netImpact: number;
  latestTimestamp: number;
  entries: ModificationImpact[];
};

export default function BalanceDeltaPage() {
  const session = getCurrentSession();
  const sessionStartMs = session ? getTransactionTimestamp(session.loginAt) : Date.now();
  const now = new Date();
  const [scope, setScope] = useState<DeltaScope>("session");
  const [selectedDay, setSelectedDay] = useState<string>(toDateInputValue(now));
  const [rangeStart, setRangeStart] = useState<string>(toDateInputValue(new Date(sessionStartMs)));
  const [rangeEnd, setRangeEnd] = useState<string>(toDateInputValue(now));

  const allTransactions = useMemo(() => getTransactions(), []);
  const allAuditEntries = useMemo(() => getAuditLog(), []);

  const { startMs, endMs, subtitle } = useMemo(() => {
    const nowMs = Date.now();
    if (scope === "day") {
      const start = parseLocalDate(selectedDay, false);
      const end = parseLocalDate(selectedDay, true);
      if (start && end) {
        return {
          startMs: start.getTime(),
          endMs: end.getTime(),
          subtitle: `Variations du solde pour la date du ${start.toLocaleDateString("fr-FR")}.`,
        };
      }
    }

    if (scope === "range") {
      const parsedStart = parseLocalDate(rangeStart, false);
      const parsedEnd = parseLocalDate(rangeEnd, true);
      if (parsedStart && parsedEnd) {
        const start = parsedStart.getTime() <= parsedEnd.getTime() ? parsedStart : parsedEnd;
        const end = parsedStart.getTime() <= parsedEnd.getTime() ? parsedEnd : parsedStart;
        return {
          startMs: start.getTime(),
          endMs: end.getTime(),
          subtitle: `Variations du solde sur la periode du ${start.toLocaleDateString("fr-FR")} au ${end.toLocaleDateString("fr-FR")}.`,
        };
      }
    }

    return {
      startMs: sessionStartMs,
      endMs: nowMs,
      subtitle: `Variations du solde depuis le debut de la session (${new Date(sessionStartMs).toLocaleString("fr-FR")}).`,
    };
  }, [scope, selectedDay, rangeStart, rangeEnd, sessionStartMs]);

  const operations = useMemo(() => {
    return allTransactions
      .filter((tx) => {
        const ts = getTransactionTimestamp(tx.createdAt || tx.date);
        return ts >= startMs && ts <= endMs;
      })
      .sort((a, b) => getTransactionTimestamp(b.createdAt || b.date) - getTransactionTimestamp(a.createdAt || a.date))
      .map((tx) => ({
        ...tx,
        impact: tx.type === "income" ? tx.amount : -tx.amount,
      }));
  }, [allTransactions, startMs, endMs]);

  const auditCorrectionGroups = useMemo(() => {
    const impacts = allAuditEntries
      .filter((entry) => entry.entityType === "transaction")
      .map((entry) => ({
        entry,
        impact: getAuditUpdateImpact(entry),
      }))
      .filter((item): item is ModificationImpact => item.impact !== null && item.impact !== 0)
      .filter(({ entry }) => getTransactionTimestamp(entry.timestamp) >= startMs && getTransactionTimestamp(entry.timestamp) <= endMs)
      .sort((a, b) => getTransactionTimestamp(b.entry.timestamp) - getTransactionTimestamp(a.entry.timestamp));

    const grouped = new Map<string, ModificationGroup>();
    for (const item of impacts) {
      const key = item.entry.entityId || item.entry.id;
      const existing = grouped.get(key);
      const timestamp = getTransactionTimestamp(item.entry.timestamp);
      if (existing) {
        existing.entries.push(item);
        existing.netImpact += item.impact;
        existing.latestTimestamp = Math.max(existing.latestTimestamp, timestamp);
      } else {
        grouped.set(key, {
          entityId: key,
          label: getAuditEntryLabel(item.entry),
          netImpact: item.impact,
          latestTimestamp: timestamp,
          entries: [item],
        });
      }
    }

    return [...grouped.values()].sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }, [allAuditEntries, startMs, endMs]);

  const delta = operations.reduce((sum, op) => sum + op.impact, 0);
  const auditDelta = auditCorrectionGroups.reduce((sum, item) => sum + item.netImpact, 0);
  const unexplainedDelta = delta - auditDelta;
  const currentBalance = getGlobalStats().balance;
  const impactFromStartToNow = allTransactions
    .filter((tx) => getTransactionTimestamp(tx.createdAt || tx.date) >= startMs)
    .reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0);
  const impactAfterEnd = allTransactions
    .filter((tx) => getTransactionTimestamp(tx.createdAt || tx.date) > endMs)
    .reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0);
  const periodStartBalance = currentBalance - impactFromStartToNow;
  const periodEndBalance = currentBalance - impactAfterEnd;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <LineChart className="h-5 w-5 sm:h-6 sm:w-6" />
          Ecart de solde
        </h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Perimetre</p>
              <Select value={scope} onValueChange={(value) => setScope(value as DeltaScope)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un perimetre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="session">Depuis la session</SelectItem>
                  <SelectItem value="day">Une date precise</SelectItem>
                  <SelectItem value="range">Une periode</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "day" && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <Input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} />
              </div>
            )}

            {scope === "range" && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Debut</p>
                  <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fin</p>
                  <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Solde debut periode</p>
            <p className="text-lg font-bold">{formatCurrency(periodStartBalance)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ecart cumule periode</p>
            <p className={`text-lg font-bold ${delta >= 0 ? "text-success" : "text-destructive"}`}>
              {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Impact des modifications</p>
            <p className={`text-lg font-bold ${auditDelta >= 0 ? "text-success" : "text-destructive"}`}>
              {auditDelta >= 0 ? "+" : ""}{formatCurrency(auditDelta)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ecart restant a expliquer</p>
            <p className={`text-lg font-bold ${unexplainedDelta === 0 ? "text-foreground" : unexplainedDelta > 0 ? "text-success" : "text-destructive"}`}>
              {unexplainedDelta >= 0 ? "+" : ""}{formatCurrency(unexplainedDelta)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Solde fin periode</p>
            <p className="text-lg font-bold">{formatCurrency(periodEndBalance)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Operations impactant le solde</CardTitle>
        </CardHeader>
        <CardContent>
          {operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune operation enregistree sur la plage choisie.</p>
          ) : (
            <div className="space-y-2">
              {operations.map((op) => (
                <div key={op.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{op.category}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(op.createdAt || op.date).toLocaleString("fr-FR")}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{op.personName || "Sans nom"}</p>
                    <p className="text-xs text-muted-foreground truncate">{op.description || "Sans description"}</p>
                  </div>
                  <div className={`text-sm font-semibold shrink-0 ${op.impact >= 0 ? "text-success" : "text-destructive"}`}>
                    <span className="inline-flex items-center gap-1">
                      {op.impact >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      {op.impact >= 0 ? "+" : ""}{formatCurrency(op.impact)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Corrections d'audit ayant impacte les chiffres</CardTitle>
        </CardHeader>
        <CardContent>
          {auditCorrectionGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune correction d'audit avec impact financier sur la plage choisie.</p>
          ) : (
            <div className="space-y-3">
              {auditCorrectionGroups.map((group) => (
                <div key={group.entityId} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{group.label}</p>
                      <p className="text-xs text-muted-foreground">{group.entries.length} correction{group.entries.length > 1 ? "s" : ""} sur cette transaction</p>
                    </div>
                    <div className={`text-sm font-semibold shrink-0 ${group.netImpact >= 0 ? "text-success" : "text-destructive"}`}>
                      <span className="inline-flex items-center gap-1">
                        {group.netImpact >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        {group.netImpact >= 0 ? "+" : ""}{formatCurrency(group.netImpact)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {group.entries.map(({ entry, impact }) => {
                      const normalizedAction = String(entry.action ?? "").toLowerCase();
                      const readableDetails = normalizedAction === "update" && entry.previousData && entry.newData
                        ? getAuditUpdateSummary(entry)
                        : entry.details;

                      return (
                        <div key={entry.id} className="rounded-md bg-muted/40 p-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{actionLabels[normalizedAction] || entry.action}</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString("fr-FR")}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{entry.username}</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{readableDetails || entry.details}</p>
                          </div>
                          <div className={`text-xs font-semibold shrink-0 ${impact >= 0 ? "text-success" : "text-destructive"}`}>
                            {impact >= 0 ? "+" : ""}{formatCurrency(impact)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
