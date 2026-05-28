import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getGlobalStats, getTransactions, formatCurrency } from "@/lib/data";
import { getCurrentSession } from "@/lib/auth";
import { getTransactionTimestamp } from "@/lib/transactionDates";
import { ArrowDownRight, ArrowUpRight, LineChart } from "lucide-react";

export default function BalanceDeltaPage() {
  const session = getCurrentSession();
  const sessionStartMs = session ? getTransactionTimestamp(session.loginAt) : Date.now();

  const operations = useMemo(() => {
    const txs = getTransactions();
    return txs
      .filter((tx) => {
        const ts = getTransactionTimestamp(tx.createdAt || tx.date);
        return ts >= sessionStartMs;
      })
      .sort((a, b) => getTransactionTimestamp(b.createdAt || b.date) - getTransactionTimestamp(a.createdAt || a.date))
      .map((tx) => ({
        ...tx,
        impact: tx.type === "income" ? tx.amount : -tx.amount,
      }));
  }, [sessionStartMs]);

  const delta = operations.reduce((sum, op) => sum + op.impact, 0);
  const currentBalance = getGlobalStats().balance;
  const sessionStartBalance = currentBalance - delta;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <LineChart className="h-5 w-5 sm:h-6 sm:w-6" />
          Ecart de solde
        </h2>
        <p className="text-sm text-muted-foreground">
          Variations du solde depuis le debut de la session ({new Date(sessionStartMs).toLocaleString("fr-FR")}).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Solde debut session</p>
            <p className="text-lg font-bold">{formatCurrency(sessionStartBalance)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ecart cumule session</p>
            <p className={`text-lg font-bold ${delta >= 0 ? "text-success" : "text-destructive"}`}>
              {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Solde actuel</p>
            <p className="text-lg font-bold">{formatCurrency(currentBalance)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Operations impactant le solde</CardTitle>
        </CardHeader>
        <CardContent>
          {operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune operation enregistree depuis le debut de cette session.</p>
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
