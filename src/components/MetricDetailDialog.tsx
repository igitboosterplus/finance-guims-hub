import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TransactionList } from "@/components/TransactionList";
import { formatCurrency, type Transaction } from "@/lib/data";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface MetricDetailSummaryItem {
  label: string;
  value: number;
  isCurrency?: boolean;
}

interface MetricDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  summaryItems?: MetricDetailSummaryItem[];
  transactions?: Transaction[];
  showDepartment?: boolean;
  note?: string;
}

function toDisplayValue(value: number, isCurrency?: boolean): string {
  return isCurrency === false ? String(value) : formatCurrency(value);
}

export function MetricDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  summaryItems = [],
  transactions = [],
  showDepartment = true,
  note,
}: MetricDetailDialogProps) {
  const [showDerivedStats, setShowDerivedStats] = useState(false);
  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const averageAmount = transactions.length > 0 ? totalAmount / transactions.length : 0;
  const minAmount = transactions.length > 0 ? Math.min(...transactions.map((tx) => tx.amount)) : 0;
  const maxAmount = transactions.length > 0 ? Math.max(...transactions.map((tx) => tx.amount)) : 0;
  const latestTransactionDate = transactions.length > 0
    ? [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
    : null;

  const derivedSummaryItems: MetricDetailSummaryItem[] = transactions.length > 0 ? [
    { label: 'Nombre d\'éléments', value: transactions.length, isCurrency: false },
    { label: 'Total des montants', value: totalAmount },
    { label: 'Montant moyen', value: averageAmount },
    { label: 'Montant min.', value: minAmount },
    { label: 'Montant max.', value: maxAmount },
    ...(latestTransactionDate ? [{ label: 'Dernière opération', value: 1, isCurrency: false }] : []),
  ] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-7xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {summaryItems.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 text-base font-bold text-foreground">{toDisplayValue(item.value, item.isCurrency)}</p>
                </div>
              ))}
            </div>
          )}

          {derivedSummaryItems.length > 0 && (
            <Collapsible open={showDerivedStats} onOpenChange={setShowDerivedStats} className="rounded-lg border bg-background/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Statistiques complémentaires</p>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    {showDerivedStats ? 'Masquer' : 'Afficher'}
                    {showDerivedStats ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="pt-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {derivedSummaryItems.map((item) => (
                    <div key={item.label} className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">{item.label === 'Dernière opération' && latestTransactionDate ? new Date(latestTransactionDate).toLocaleString('fr-FR') : toDisplayValue(item.value, item.isCurrency)}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {note && (
            <div className="rounded-xl border border-dashed bg-background p-3 text-sm text-muted-foreground">
              {note}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Transactions liées</p>
              <p className="text-xs text-muted-foreground">Cliquez dans le tableau pour filtrer ou modifier un élément.</p>
            </div>
            <Badge variant="secondary">{transactions.length} élément(s)</Badge>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto pr-1">
            {transactions.length > 0 ? (
              <TransactionList transactions={transactions} showDepartment={showDepartment} disablePagination displayMode="table" />
            ) : (
              <p className="py-8 text-sm text-muted-foreground">Aucun élément lié pour cet indicateur.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}