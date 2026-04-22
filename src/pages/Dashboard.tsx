import { useState, useEffect } from "react";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Receipt, Wallet, Smartphone, Building2, Banknote, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { DepartmentCard } from "@/components/DepartmentCard";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { ReportDialog } from "@/components/ReportDialog";
import { departments, getGlobalStats, getTransactions, getStatsByPaymentMethod } from "@/lib/data";
import { getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import { toast } from "sonner";
import { downloadDashboardReport, downloadTransactionsReport } from "@/lib/reports";
import type { ReportOptions } from "@/lib/reports";
import logoGuimsGroup from "@/assets/logo-guims-group.jpg";

export default function Dashboard() {
  const sortTransactionsByRecency = <T extends { date: string; createdAt?: string }>(items: T[]) => {
    return [...items].sort((a, b) => {
      const ta = new Date(a.createdAt || a.date).getTime();
      const tb = new Date(b.createdAt || b.date).getTime();
      return tb - ta;
    });
  };

  const [stats, setStats] = useState(getGlobalStats());
  const [transactions, setTransactions] = useState(getTransactions());
  const [paymentStats, setPaymentStats] = useState(getStatsByPaymentMethod());
  const [reportOpen, setReportOpen] = useState(false);

  const refresh = () => {
    setStats(getGlobalStats());
    setTransactions(getTransactions());
    setPaymentStats(getStatsByPaymentMethod());
  };

  const generateCurrentMonthReport = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startDate = new Date(y, m, 1).toISOString().slice(0, 10);
    const endDate = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    downloadTransactionsReport({ startDate, endDate });
    toast.success(`Rapport mensuel (${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}) téléchargé`);
  };

  const autoGenerateEndOfMonthReport = () => {
    if (!hasPermission(getCurrentUser(), 'canExportData')) return;
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() !== lastDayOfMonth) return;

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const storageKey = `monthly-report-generated-${monthKey}`;
    if (localStorage.getItem(storageKey)) return;

    generateCurrentMonthReport();
    localStorage.setItem(storageKey, now.toISOString());
  };

  useEffect(() => {
    refresh();
    autoGenerateEndOfMonthReport();
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero header */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-6 flex items-center gap-3 sm:gap-5">
        <img src={logoGuimsGroup} alt="Guims Group" className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl object-cover shadow-md hidden sm:block" />
        <div className="flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Tableau de bord</h2>
          <p className="text-muted-foreground text-sm">Vue globale des finances de Guims Group</p>
        </div>
        <div className="flex gap-2">
          {hasPermission(getCurrentUser(), 'canExportData') && (
            <Button variant="outline" size="sm" className="gap-2" onClick={generateCurrentMonthReport}>
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Rapport mensuel</span>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setReportOpen(true)}>
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Rapport PDF</span>
          </Button>
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        title="Rapport global"
        onGenerate={(opts) => { downloadDashboardReport(opts); toast.success('Rapport PDF téléchargé'); }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Revenus totaux" value={stats.income} icon={ArrowUpRight} colorClass="text-success" />
        <StatsCard title="Dépenses totales" value={stats.expenses} icon={ArrowDownRight} colorClass="text-destructive" />
        <StatsCard title="Solde" value={stats.balance} icon={TrendingUp} colorClass={stats.balance >= 0 ? "text-success" : "text-destructive"} />
        <StatsCard title="Transactions" value={stats.count} icon={Receipt} isCurrency={false} />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Départements</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {departments.filter(d => hasDepartmentAccess(getCurrentUser(), d.id)).map((dept) => (
            <DepartmentCard key={dept.id} department={dept} />
          ))}
        </div>
      </div>

      {/* Soldes par caisse */}
      {paymentStats.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Soldes par caisse</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {paymentStats.map((ps) => {
              const icon = ps.method === 'especes' ? Banknote : ps.method === 'momo' ? Smartphone : ps.method === 'om' ? Wallet : Building2;
              return (
                <StatsCard
                  key={ps.method}
                  title={ps.label}
                  value={ps.balance}
                  icon={icon}
                  colorClass={ps.balance >= 0 ? 'text-success' : 'text-destructive'}
                />
              );
            })}
          </div>
        </div>
      )}

      <FinanceChart transactions={transactions} title="Analyse globale" />

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Dernières transactions</h3>
        <TransactionList transactions={sortTransactionsByRecency(transactions).slice(0, 10)} onDelete={refresh} showDepartment />
      </div>
    </div>
  );
}
