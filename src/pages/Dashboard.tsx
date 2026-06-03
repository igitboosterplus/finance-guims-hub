import { useState, useEffect } from "react";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Receipt, Wallet, Smartphone, Building2, Banknote, FileDown, HandCoins, PackageOpen, BadgeDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { DepartmentCard } from "@/components/DepartmentCard";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { ReportDialog } from "@/components/ReportDialog";
import { DepartmentAnalysis } from "@/components/DepartmentAnalysis";
import { departments, getGlobalStats, getTransactions, getStatsByPaymentMethod, getMonthlyStats, computeTrend, getTransactionsByMonth } from "@/lib/data";
import { getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import { getTreasuryControlAlerts } from "@/lib/controlAlerts";
import { getGlobalStockEconomicsSummary } from "@/lib/stock";
import { toast } from "sonner";
import { downloadDashboardReport, downloadTransactionsReport } from "@/lib/reports";
import logoGuimsGroup from "@/assets/logo-guims-group.jpg";
import { getTransactionTimestamp } from "@/lib/transactionDates";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const sortTransactionsByRecency = <T extends { date: string; createdAt?: string }>(items: T[]) => {
    return [...items].sort((a, b) => {
      const ta = getTransactionTimestamp(a.createdAt || a.date);
      const tb = getTransactionTimestamp(b.createdAt || b.date);
      return tb - ta;
    });
  };

  const [stats, setStats] = useState(getGlobalStats());
  const [transactions, setTransactions] = useState(getTransactions());
  const [paymentStats, setPaymentStats] = useState(getStatsByPaymentMethod());
  const [controlAlerts, setControlAlerts] = useState(getTreasuryControlAlerts());
  const [reportOpen, setReportOpen] = useState(false);
  const [dashboardView, setDashboardView] = useState<'global' | 'monthly'>('global');

  const now = new Date();
  const isSuperAdmin = getCurrentUser()?.role === 'superadmin';
  const currentMonthStats = getMonthlyStats(now.getFullYear(), now.getMonth());
  const previousMonthStats = now.getMonth() === 0
    ? getMonthlyStats(now.getFullYear() - 1, 11)
    : getMonthlyStats(now.getFullYear(), now.getMonth() - 1);
  const currentMonthTransactions = getTransactionsByMonth(now.getFullYear(), now.getMonth());
  const globalStockEconomics = getGlobalStockEconomicsSummary();
  const monthlyStockEconomics = getGlobalStockEconomicsSummary(now.getFullYear(), now.getMonth());
  const cashResultExcludingExternal = stats.operationalIncome - stats.expenses;
  const monthlyCashResultExcludingExternal = currentMonthStats.operationalIncome - currentMonthStats.expenses;
  const adjustedActivityMargin = stats.operationalIncome - globalStockEconomics.totalConsumedCost;
  const adjustedMonthlyActivityMargin = currentMonthStats.operationalIncome - monthlyStockEconomics.totalConsumedCost;

  const incomeTrend = computeTrend(currentMonthStats.income, previousMonthStats.income);
  const expenseTrend = computeTrend(currentMonthStats.expenses, previousMonthStats.expenses);
  const balanceTrend = computeTrend(currentMonthStats.balance, previousMonthStats.balance);

  const refresh = () => {
    setStats(getGlobalStats());
    setTransactions(getTransactions());
    setPaymentStats(getStatsByPaymentMethod());
    setControlAlerts(getTreasuryControlAlerts());
  };

  const generateCurrentMonthReport = async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startDate = new Date(y, m, 1).toISOString().slice(0, 10);
    const endDate = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    await downloadTransactionsReport({ startDate, endDate });
    toast.success(`Rapport mensuel (${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}) téléchargé`);
  };

  const autoGenerateEndOfMonthReport = async () => {
    if (!hasPermission(getCurrentUser(), 'canExportData')) return;
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() !== lastDayOfMonth) return;

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const storageKey = `monthly-report-generated-${monthKey}`;
    if (localStorage.getItem(storageKey)) return;

    await generateCurrentMonthReport();
    localStorage.setItem(storageKey, now.toISOString());
  };

  useEffect(() => {
    refresh();
    void autoGenerateEndOfMonthReport();
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero header */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-6 flex items-center gap-3 sm:gap-5">
        <img src={logoGuimsGroup} alt="Guims Group" className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl object-cover shadow-md hidden sm:block" />
        <div className="flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Tableau de bord</h2>
          <p className="text-muted-foreground text-sm">
            {dashboardView === 'global' ? 'Vue globale des finances de Guims Group' : `Vue mensuelle (${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})`}
          </p>
          <div className="mt-3 inline-flex rounded-lg border bg-background p-1">
            <Button
              size="sm"
              variant={dashboardView === 'global' ? 'default' : 'ghost'}
              onClick={() => setDashboardView('global')}
              className="h-8"
            >
              Vue globale
            </Button>
            <Button
              size="sm"
              variant={dashboardView === 'monthly' ? 'default' : 'ghost'}
              onClick={() => setDashboardView('monthly')}
              className="h-8"
            >
              Vue mensuelle
            </Button>
          </div>
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
        onGenerate={async (opts) => { await downloadDashboardReport(opts); toast.success('Rapport généré'); }}
      />

      {dashboardView === 'global' ? (
        <>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">Vue globale (toutes périodes)</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Depuis le début des enregistrements</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <StatsCard title="Revenus totaux" value={stats.income} icon={ArrowUpRight} colorClass="text-success" />
              <StatsCard title="Apports externes" value={stats.externalIncome} icon={HandCoins} colorClass="text-primary" />
              <StatsCard title="Résultat caisse hors apports" value={cashResultExcludingExternal} icon={BadgeDollarSign} colorClass={cashResultExcludingExternal >= 0 ? "text-success" : "text-destructive"} />
              <StatsCard title="Coût stock consommé" value={globalStockEconomics.totalConsumedCost} icon={PackageOpen} colorClass="text-amber-600" />
              <StatsCard title="Marge activité ajustée" value={adjustedActivityMargin} icon={TrendingUp} colorClass={adjustedActivityMargin >= 0 ? "text-success" : "text-destructive"} />
              <StatsCard title="Dépenses totales" value={stats.expenses} icon={ArrowDownRight} colorClass="text-destructive" />
              <StatsCard title="Transactions globales" value={stats.count} icon={Receipt} isCurrency={false} />
            </div>
            <p className="text-xs text-muted-foreground">
              Le solde de caisse reste base sur les entrees/sorties reelles. La marge activite ajustee deduit en plus le cout economique des articles sortis du stock.
            </p>
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

          <DepartmentAnalysis />

          {isSuperAdmin && (
          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-lg font-semibold text-foreground">Indicateurs de vigilance trésorerie</h3>
              <span className="text-xs text-muted-foreground">Pilotage des écarts opérationnels</span>
            </div>
            <div className="space-y-2">
              {controlAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => navigate(alert.actionPath)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${alert.severity === 'high' ? 'border-destructive/40 bg-destructive/5' : alert.severity === 'medium' ? 'border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20' : 'border-success/30 bg-success/5'}`}
                >
                  <p className="text-sm font-semibold text-foreground text-left">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.details}</p>
                  <p className="text-xs mt-1 text-primary text-left">Action: {alert.actionLabel}</p>
                </button>
              ))}
            </div>
          </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">Dernières transactions (global)</h3>
            <TransactionList transactions={sortTransactionsByRecency(transactions).slice(0, 10)} onDelete={refresh} showDepartment />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">Vue mensuelle (distincte)</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <StatsCard title="Revenus du mois" value={currentMonthStats.income} icon={ArrowUpRight} colorClass="text-success" trend={incomeTrend} />
            <StatsCard title="Apports externes (mois)" value={currentMonthStats.externalIncome} icon={HandCoins} colorClass="text-primary" />
            <StatsCard title="Résultat caisse hors apports" value={monthlyCashResultExcludingExternal} icon={BadgeDollarSign} colorClass={monthlyCashResultExcludingExternal >= 0 ? "text-success" : "text-destructive"} />
            <StatsCard title="Coût stock consommé" value={monthlyStockEconomics.totalConsumedCost} icon={PackageOpen} colorClass="text-amber-600" />
            <StatsCard title="Marge activité ajustée" value={adjustedMonthlyActivityMargin} icon={TrendingUp} colorClass={adjustedMonthlyActivityMargin >= 0 ? "text-success" : "text-destructive"} />
            <StatsCard title="Dépenses du mois" value={currentMonthStats.expenses} icon={ArrowDownRight} colorClass="text-destructive" trend={expenseTrend} invertTrend />
            <StatsCard title="Transactions du mois" value={currentMonthStats.count} icon={Receipt} isCurrency={false} />
          </div>
          <p className="text-xs text-muted-foreground">
            La marge ajustee du mois tient compte des supports/utilisations de stock pour montrer ce qui a reellement ete genere par l'activite.
          </p>

          {currentMonthTransactions.length > 0 ? (
            <>
              <FinanceChart
                transactions={currentMonthTransactions}
                title={`Analyse du mois (${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})`}
              />

              <div>
                <h4 className="text-base font-semibold text-foreground mb-3">
                  Transactions du mois ({now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})
                </h4>
                <TransactionList transactions={sortTransactionsByRecency(currentMonthTransactions)} onDelete={refresh} showDepartment />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune transaction enregistrée pour ce mois.</p>
          )}
        </div>
      )}
    </div>
  );
}
