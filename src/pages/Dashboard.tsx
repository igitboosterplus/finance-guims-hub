import { useState, useEffect } from "react";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Receipt, Wallet, Smartphone, Building2, Banknote, FileDown, HandCoins, PackageOpen, BadgeDollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { MetricDetailDialog } from "@/components/MetricDetailDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DepartmentCard } from "@/components/DepartmentCard";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { ReportDialog } from "@/components/ReportDialog";
import { DepartmentAnalysis } from "@/components/DepartmentAnalysis";
import { departments, getGlobalStats, getTransactions, getStatsByPaymentMethod, getMonthlyStats, computeTrend, getTransactionsByMonth, isFormationRevenueCategory, isStockSaleTransaction, normalizePaymentMethod, type Transaction } from "@/lib/data";
import { getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import { getTreasuryControlAlerts } from "@/lib/controlAlerts";
import { getGlobalStockEconomicsSummary } from "@/lib/stock";
import { toast } from "sonner";
import { downloadDashboardReport, downloadRealProfitReport, downloadTransactionsReport } from "@/lib/reports";
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
  const [selectedGlobalCashMethod, setSelectedGlobalCashMethod] = useState<string>("");
  const [selectedMonthlyCashMethod, setSelectedMonthlyCashMethod] = useState<string>("");
  const [controlAlerts, setControlAlerts] = useState(getTreasuryControlAlerts());
  const [reportOpen, setReportOpen] = useState(false);
  const [dashboardView, setDashboardView] = useState<'global' | 'monthly'>('global');
  const [globalMetricsOpen, setGlobalMetricsOpen] = useState(false);
  const [monthlyMetricsOpen, setMonthlyMetricsOpen] = useState(false);
  const [metricDetail, setMetricDetail] = useState<{
    title: string;
    description: string;
    summaryItems: Array<{ label: string; value: number; isCurrency?: boolean }>;
    transactions: Transaction[];
    note?: string;
    showDepartment?: boolean;
  } | null>(null);

  const now = new Date();
  const isSuperAdmin = getCurrentUser()?.role === 'superadmin';
  const currentMonthStats = getMonthlyStats(now.getFullYear(), now.getMonth());
  const previousMonthStats = now.getMonth() === 0
    ? getMonthlyStats(now.getFullYear() - 1, 11)
    : getMonthlyStats(now.getFullYear(), now.getMonth() - 1);
  const currentMonthTransactions = getTransactionsByMonth(now.getFullYear(), now.getMonth());
  const monthlyPaymentStats = getStatsByPaymentMethod(currentMonthTransactions);
  const globalStockEconomics = getGlobalStockEconomicsSummary();
  const monthlyStockEconomics = getGlobalStockEconomicsSummary(now.getFullYear(), now.getMonth());
  const getAdjustedFormationMargin = (items: typeof transactions, stockEconomics: typeof globalStockEconomics) => {
    const formationRevenue = items
      .filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category))
      .reduce((sum, tx) => sum + tx.amount, 0);
    return formationRevenue - stockEconomics.trainingSupportCost - stockEconomics.giftCost;
  };
  const cashResultExcludingExternal = stats.operationalIncome - stats.expenses;
  const monthlyCashResultExcludingExternal = currentMonthStats.operationalIncome - currentMonthStats.expenses;
  const adjustedActivityMargin = stats.operationalIncome - globalStockEconomics.totalConsumedCost;
  const adjustedMonthlyActivityMargin = currentMonthStats.operationalIncome - monthlyStockEconomics.totalConsumedCost;
  const adjustedFormationMargin = getAdjustedFormationMargin(transactions, globalStockEconomics);
  const adjustedMonthlyFormationMargin = getAdjustedFormationMargin(currentMonthTransactions, monthlyStockEconomics);

  const openDetail = (detail: NonNullable<typeof metricDetail>) => setMetricDetail(detail);
  const getPaymentIcon = (method: string) => {
    if (method.startsWith('momo')) return Smartphone;
    if (method.startsWith('om')) return Wallet;
    if (method === 'especes') return Banknote;
    return Building2;
  };

  const buildRealProfitReportOptions = () => {
    if (dashboardView !== 'monthly') return undefined;
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { startDate, endDate };
  };

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

  useEffect(() => {
    if (paymentStats.length === 0) {
      setSelectedGlobalCashMethod("");
      return;
    }
    if (!selectedGlobalCashMethod || !paymentStats.some((item) => item.method === selectedGlobalCashMethod)) {
      setSelectedGlobalCashMethod(paymentStats[0].method);
    }
  }, [paymentStats, selectedGlobalCashMethod]);

  useEffect(() => {
    if (monthlyPaymentStats.length === 0) {
      setSelectedMonthlyCashMethod("");
      return;
    }
    if (!selectedMonthlyCashMethod || !monthlyPaymentStats.some((item) => item.method === selectedMonthlyCashMethod)) {
      setSelectedMonthlyCashMethod(monthlyPaymentStats[0].method);
    }
  }, [monthlyPaymentStats, selectedMonthlyCashMethod]);

  const downloadCashTransactionsPdf = async (scope: 'global' | 'monthly') => {
    const selectedMethod = scope === 'global' ? selectedGlobalCashMethod : selectedMonthlyCashMethod;
    const selectedStats = (scope === 'global' ? paymentStats : monthlyPaymentStats).find((item) => item.method === selectedMethod);
    if (!selectedStats) {
      toast.error("Veuillez sélectionner une caisse.");
      return;
    }

    if (scope === 'monthly') {
      const y = now.getFullYear();
      const m = now.getMonth();
      const startDate = new Date(y, m, 1).toISOString().slice(0, 10);
      const endDate = new Date(y, m + 1, 0).toISOString().slice(0, 10);
      await downloadTransactionsReport({ startDate, endDate, paymentMethod: selectedStats.method });
    } else {
      await downloadTransactionsReport({ paymentMethod: selectedStats.method });
    }

    toast.success(`Rapport PDF de la caisse ${selectedStats.label} téléchargé.`);
  };

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
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              await downloadRealProfitReport(buildRealProfitReportOptions());
              toast.success('Rapport bénéfice réel généré');
            }}
          >
            <BadgeDollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Bénéfice réel</span>
          </Button>
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

      <MetricDetailDialog
        open={!!metricDetail}
        onOpenChange={(open) => !open && setMetricDetail(null)}
        title={metricDetail?.title || "Détail"}
        description={metricDetail?.description || ""}
        summaryItems={metricDetail?.summaryItems || []}
        transactions={metricDetail?.transactions || []}
        showDepartment={metricDetail?.showDepartment ?? true}
        note={metricDetail?.note}
      />

      {dashboardView === 'global' ? (
        <>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">Vue globale (toutes périodes)</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Depuis le début des enregistrements</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <StatsCard
                title="Revenus totaux"
                value={stats.income}
                icon={ArrowUpRight}
                colorClass="text-success"
                onClick={() => openDetail({
                  title: 'Revenus totaux',
                  description: 'Tous les revenus enregistrés sur le périmètre global.',
                  summaryItems: [
                    { label: 'Revenus totaux', value: stats.income },
                    { label: 'Revenus opérationnels', value: stats.operationalIncome },
                    { label: 'Apports externes', value: stats.externalIncome },
                  ],
                  transactions: transactions.filter((tx) => tx.type === 'income'),
                })}
              />
              <StatsCard
                title="Solde de caisse"
                value={stats.balance}
                icon={BadgeDollarSign}
                colorClass={stats.balance >= 0 ? "text-success" : "text-destructive"}
                onClick={() => openDetail({
                  title: 'Solde de caisse',
                  description: 'Synthèse caisse complète: revenus, dépenses et solde net.',
                  summaryItems: [
                    { label: 'Revenus', value: stats.income },
                    { label: 'Dépenses', value: stats.expenses },
                    { label: 'Solde de caisse', value: stats.balance },
                  ],
                  transactions,
                })}
              />
              <StatsCard
                title="Résultat caisse hors apports"
                value={cashResultExcludingExternal}
                icon={ArrowDownRight}
                colorClass={cashResultExcludingExternal >= 0 ? "text-success" : "text-destructive"}
                onClick={() => openDetail({
                  title: 'Résultat caisse hors apports',
                  description: 'Lecture opérationnelle du cash sans les apports externes.',
                  summaryItems: [
                    { label: 'Revenus opérationnels', value: stats.operationalIncome },
                    { label: 'Apports externes', value: stats.externalIncome },
                    { label: 'Dépenses', value: stats.expenses },
                    { label: 'Résultat hors apports', value: cashResultExcludingExternal },
                  ],
                  transactions,
                })}
              />
              <StatsCard
                title="Marge activité ajustée"
                value={adjustedActivityMargin}
                icon={TrendingUp}
                colorClass={adjustedActivityMargin >= 0 ? "text-success" : "text-destructive"}
                onClick={() => openDetail({
                  title: 'Marge activité ajustée',
                  description: 'Revenus opérationnels moins le coût économique du stock consommé.',
                  summaryItems: [
                    { label: 'Revenus opérationnels', value: stats.operationalIncome },
                    { label: 'Coût stock consommé', value: globalStockEconomics.totalConsumedCost },
                    { label: 'Marge ajustée', value: adjustedActivityMargin },
                  ],
                  transactions,
                  note: 'Le détail du coût stock vient des mouvements de stock. Le tableau des transactions montre l’activité qui alimente ce calcul.',
                })}
              />
            </div>
            <Collapsible open={globalMetricsOpen} onOpenChange={setGlobalMetricsOpen} className="rounded-2xl border bg-card/60 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Indicateurs détaillés</p>
                  <p className="text-xs text-muted-foreground">Apports, marges spécifiques, coût du stock et volume d'opérations.</p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    {globalMetricsOpen ? 'Masquer' : 'Voir plus'}
                    {globalMetricsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatsCard title="Apports externes" value={stats.externalIncome} icon={HandCoins} colorClass="text-primary" onClick={() => openDetail({ title: 'Apports externes', description: 'Tous les apports externes du périmètre global.', summaryItems: [{ label: 'Total apports externes', value: stats.externalIncome }], transactions: transactions.filter((tx) => tx.type === 'income' && tx.incomeNature === 'external-contribution') })} />
                  <StatsCard title="Marge ventes stock" value={globalStockEconomics.soldGrossMargin} icon={PackageOpen} colorClass={globalStockEconomics.soldGrossMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: 'Marge ventes stock', description: 'Ventes de stock et coût d’achat associé.', summaryItems: [{ label: 'Revenu stock vendu', value: globalStockEconomics.soldRevenue }, { label: 'Coût stock vendu', value: globalStockEconomics.soldCost }, { label: 'Marge brute', value: globalStockEconomics.soldGrossMargin }], transactions: transactions.filter((tx) => tx.type === 'income' && isStockSaleTransaction(tx)), note: 'Le coût exact vient des mouvements de stock. La liste montre les ventes liées aux sorties de stock.' })} />
                  <StatsCard title="Marge formation ajustée" value={adjustedFormationMargin} icon={TrendingUp} colorClass={adjustedFormationMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: 'Marge formation ajustée', description: 'Revenus formation moins supports et cadeaux consommés.', summaryItems: [{ label: 'Revenus formation', value: transactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)).reduce((sum, tx) => sum + tx.amount, 0) }, { label: 'Supports formation', value: globalStockEconomics.trainingSupportCost }, { label: 'Cadeaux', value: globalStockEconomics.giftCost }, { label: 'Marge formation', value: adjustedFormationMargin }], transactions: transactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)) })} />
                  <StatsCard title="Coût stock consommé" value={globalStockEconomics.totalConsumedCost} icon={PackageOpen} colorClass="text-amber-600" onClick={() => openDetail({ title: 'Coût stock consommé', description: 'Synthèse des consommations de stock.', summaryItems: [{ label: 'Coût stock consommé', value: globalStockEconomics.totalConsumedCost }, { label: 'Marge ventes stock', value: globalStockEconomics.soldGrossMargin }, { label: 'Coût supports formation', value: globalStockEconomics.trainingSupportCost + globalStockEconomics.giftCost }], transactions, note: 'Le détail complet des mouvements de stock est disponible dans la page Stock du département concerné.' })} />
                  <StatsCard title="Transactions globales" value={stats.count} icon={Receipt} isCurrency={false} onClick={() => openDetail({ title: 'Transactions globales', description: 'Toutes les transactions du périmètre global.', summaryItems: [{ label: 'Transactions', value: stats.count, isCurrency: false }], transactions })} />
                </div>
              </CollapsibleContent>
            </Collapsible>
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
                  const icon = getPaymentIcon(ps.method);
                  const cashTransactions = transactions.filter(
                    (tx) => normalizePaymentMethod(tx.paymentMethod || 'especes', tx.departmentId) === ps.method,
                  );
                  return (
                    <StatsCard
                      key={ps.method}
                      title={ps.label}
                      value={ps.balance}
                      icon={icon}
                      colorClass={ps.balance >= 0 ? 'text-success' : 'text-destructive'}
                      onClick={() => openDetail({
                        title: `Transactions caisse — ${ps.label}`,
                        description: `Toutes les opérations enregistrées sur la caisse ${ps.label}.`,
                        summaryItems: [
                          { label: 'Revenus caisse', value: ps.income },
                          { label: 'Dépenses caisse', value: ps.expenses },
                          { label: 'Solde caisse', value: ps.balance },
                          { label: 'Opérations', value: ps.count, isCurrency: false },
                        ],
                        transactions: cashTransactions,
                        showDepartment: true,
                      })}
                    />
                  );
                })}
              </div>
              {hasPermission(getCurrentUser(), 'canExportData') && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    aria-label="Choisir une caisse pour export PDF"
                    title="Choisir une caisse pour export PDF"
                    value={selectedGlobalCashMethod}
                    onChange={(e) => setSelectedGlobalCashMethod(e.target.value)}
                  >
                    {paymentStats.map((item) => (
                      <option key={`global-cash-${item.method}`} value={item.method}>{item.label}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => void downloadCashTransactionsPdf('global')}>
                    <FileDown className="h-4 w-4" />
                    Télécharger transactions PDF (caisse)
                  </Button>
                </div>
              )}
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
            <TransactionList transactions={sortTransactionsByRecency(transactions)} onDelete={refresh} showDepartment />
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
            <StatsCard title="Revenus du mois" value={currentMonthStats.income} icon={ArrowUpRight} colorClass="text-success" trend={incomeTrend} onClick={() => openDetail({ title: 'Revenus du mois', description: 'Tous les revenus du mois courant.', summaryItems: [{ label: 'Revenus du mois', value: currentMonthStats.income }, { label: 'Apports externes', value: currentMonthStats.externalIncome }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income') })} />
            <StatsCard title="Solde de caisse" value={currentMonthStats.balance} icon={BadgeDollarSign} colorClass={currentMonthStats.balance >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: 'Solde de caisse mensuel', description: 'Solde net des opérations du mois.', summaryItems: [{ label: 'Revenus', value: currentMonthStats.income }, { label: 'Dépenses', value: currentMonthStats.expenses }, { label: 'Solde', value: currentMonthStats.balance }], transactions: currentMonthTransactions })} />
            <StatsCard title="Résultat caisse hors apports" value={monthlyCashResultExcludingExternal} icon={ArrowDownRight} colorClass={monthlyCashResultExcludingExternal >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: 'Résultat caisse hors apports', description: 'Résultat du mois sans les apports externes.', summaryItems: [{ label: 'Revenus opérationnels', value: currentMonthStats.operationalIncome }, { label: 'Apports externes', value: currentMonthStats.externalIncome }, { label: 'Dépenses', value: currentMonthStats.expenses }, { label: 'Résultat hors apports', value: monthlyCashResultExcludingExternal }], transactions: currentMonthTransactions })} />
            <StatsCard title="Marge activité ajustée" value={adjustedMonthlyActivityMargin} icon={TrendingUp} colorClass={adjustedMonthlyActivityMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: 'Marge activité ajustée mensuelle', description: 'Revenus opérationnels du mois moins le coût du stock consommé.', summaryItems: [{ label: 'Revenus opérationnels', value: currentMonthStats.operationalIncome }, { label: 'Coût stock consommé', value: monthlyStockEconomics.totalConsumedCost }, { label: 'Marge ajustée', value: adjustedMonthlyActivityMargin }], transactions: currentMonthTransactions, note: 'Le coût stock est calculé à partir des mouvements de stock du mois.' })} />
          </div>
          <Collapsible open={monthlyMetricsOpen} onOpenChange={setMonthlyMetricsOpen} className="rounded-2xl border bg-muted/30 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Détails mensuels</p>
                <p className="text-xs text-muted-foreground">Apports, marges détaillées, coût stock et nombre d'opérations du mois.</p>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  {monthlyMetricsOpen ? 'Masquer' : 'Voir plus'}
                  {monthlyMetricsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatsCard title="Apports externes (mois)" value={currentMonthStats.externalIncome} icon={HandCoins} colorClass="text-primary" onClick={() => openDetail({ title: 'Apports externes du mois', description: 'Tous les apports externes du mois courant.', summaryItems: [{ label: 'Total apports externes', value: currentMonthStats.externalIncome }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income' && tx.incomeNature === 'external-contribution') })} />
                <StatsCard title="Marge ventes stock" value={monthlyStockEconomics.soldGrossMargin} icon={PackageOpen} colorClass={monthlyStockEconomics.soldGrossMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: 'Marge ventes stock du mois', description: 'Ventes de stock du mois et coût d’achat associé.', summaryItems: [{ label: 'Revenu stock vendu', value: monthlyStockEconomics.soldRevenue }, { label: 'Coût stock vendu', value: monthlyStockEconomics.soldCost }, { label: 'Marge brute', value: monthlyStockEconomics.soldGrossMargin }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income' && isStockSaleTransaction(tx)), note: 'Le coût de stock exact vient des mouvements de stock; la liste montre les ventes liées.' })} />
                <StatsCard title="Marge formation ajustée" value={adjustedMonthlyFormationMargin} icon={TrendingUp} colorClass={adjustedMonthlyFormationMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: 'Marge formation ajustée du mois', description: 'Revenus formation du mois moins supports et cadeaux consommés.', summaryItems: [{ label: 'Revenus formation', value: currentMonthTransactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)).reduce((sum, tx) => sum + tx.amount, 0) }, { label: 'Supports formation', value: monthlyStockEconomics.trainingSupportCost }, { label: 'Cadeaux', value: monthlyStockEconomics.giftCost }, { label: 'Marge formation', value: adjustedMonthlyFormationMargin }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)) })} />
                <StatsCard title="Coût stock consommé" value={monthlyStockEconomics.totalConsumedCost} icon={PackageOpen} colorClass="text-amber-600" onClick={() => openDetail({ title: 'Coût stock consommé du mois', description: 'Synthèse des consommations de stock du mois.', summaryItems: [{ label: 'Coût stock consommé', value: monthlyStockEconomics.totalConsumedCost }, { label: 'Marge ventes stock', value: monthlyStockEconomics.soldGrossMargin }, { label: 'Coût supports formation', value: monthlyStockEconomics.trainingSupportCost + monthlyStockEconomics.giftCost }], transactions: currentMonthTransactions, note: 'Le détail complet des mouvements de stock se trouve dans la page Stock.' })} />
                <StatsCard title="Transactions du mois" value={currentMonthStats.count} icon={Receipt} isCurrency={false} onClick={() => openDetail({ title: 'Transactions du mois', description: 'Toutes les transactions enregistrées sur le mois courant.', summaryItems: [{ label: 'Transactions', value: currentMonthStats.count, isCurrency: false }], transactions: currentMonthTransactions })} />
              </div>
            </CollapsibleContent>
          </Collapsible>
          <p className="text-xs text-muted-foreground">
            La marge ajustee du mois tient compte des supports/utilisations de stock pour montrer ce qui a reellement ete genere par l'activite.
          </p>

          {monthlyPaymentStats.length > 0 && (
            <div>
              <h4 className="text-base font-semibold text-foreground mb-3">Soldes par caisse (mois)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {monthlyPaymentStats.map((ps) => {
                  const icon = getPaymentIcon(ps.method);
                  const cashTransactions = currentMonthTransactions.filter(
                    (tx) => normalizePaymentMethod(tx.paymentMethod || 'especes', tx.departmentId) === ps.method,
                  );
                  return (
                    <StatsCard
                      key={`monthly-${ps.method}`}
                      title={ps.label}
                      value={ps.balance}
                      icon={icon}
                      colorClass={ps.balance >= 0 ? 'text-success' : 'text-destructive'}
                      onClick={() => openDetail({
                        title: `Transactions caisse (mois) — ${ps.label}`,
                        description: `Toutes les opérations du mois sur la caisse ${ps.label}.`,
                        summaryItems: [
                          { label: 'Revenus caisse', value: ps.income },
                          { label: 'Dépenses caisse', value: ps.expenses },
                          { label: 'Solde caisse', value: ps.balance },
                          { label: 'Opérations', value: ps.count, isCurrency: false },
                        ],
                        transactions: cashTransactions,
                        showDepartment: true,
                      })}
                    />
                  );
                })}
              </div>
              {hasPermission(getCurrentUser(), 'canExportData') && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    aria-label="Choisir une caisse mensuelle pour export PDF"
                    title="Choisir une caisse mensuelle pour export PDF"
                    value={selectedMonthlyCashMethod}
                    onChange={(e) => setSelectedMonthlyCashMethod(e.target.value)}
                  >
                    {monthlyPaymentStats.map((item) => (
                      <option key={`monthly-cash-${item.method}`} value={item.method}>{item.label}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => void downloadCashTransactionsPdf('monthly')}>
                    <FileDown className="h-4 w-4" />
                    Télécharger transactions PDF (caisse mois)
                  </Button>
                </div>
              )}
            </div>
          )}

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
