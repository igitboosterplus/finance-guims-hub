import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGlobalStats, getTransactions, formatCurrency } from "@/lib/data";
import { getCurrentSession } from "@/lib/auth";
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

export default function BalanceDeltaPage() {
  const session = getCurrentSession();
  const sessionStartMs = session ? getTransactionTimestamp(session.loginAt) : Date.now();
  const now = new Date();
  const [scope, setScope] = useState<DeltaScope>("session");
  const [selectedDay, setSelectedDay] = useState<string>(toDateInputValue(now));
  const [rangeStart, setRangeStart] = useState<string>(toDateInputValue(new Date(sessionStartMs)));
  const [rangeEnd, setRangeEnd] = useState<string>(toDateInputValue(now));

  const allTransactions = useMemo(() => getTransactions(), []);

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

  const delta = operations.reduce((sum, op) => sum + op.impact, 0);
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
    </div>
  );
}
