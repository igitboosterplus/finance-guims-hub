import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, Plus, Package, FileDown, HandCoins, BadgeDollarSign, PackageOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatsCard } from "@/components/StatsCard";
import { MetricDetailDialog } from "@/components/MetricDetailDialog";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { ReportDialog } from "@/components/ReportDialog";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { EmployeeSalaryForecast } from "@/components/EmployeeSalaryForecast";
import { formatCurrency, getDepartment, getDepartmentStats, getTransactionsByDepartment, STOCK_ENABLED_DEPARTMENT_IDS, isFormationRevenueCategory, isStockSaleTransaction, type DepartmentId, type Transaction } from "@/lib/data";
import { getCurrentUser, hasDepartmentAccess, hasPermission, hasStockAccess } from "@/lib/auth";
import { downloadDepartmentRealProfitReport, downloadDepartmentReport, downloadEmployeeSalaryReport } from "@/lib/reports";
import { toast } from "sonner";
import { getTransactionTimestamp } from "@/lib/transactionDates";
import { getEmployeesByDepartment, getEmployeeSalaryStatus } from "@/lib/employees";
import { getStockEconomicsSummary, getPaymentPlans, getPaymentReminders, getOverdueTranches, getPaidAmount, getRemainingAmount, getAllocationSummary, type PaymentPlan } from "@/lib/stock";

export default function DepartmentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus') || '';
  const dept = getDepartment(id as DepartmentId);

  const [stats, setStats] = useState(getDepartmentStats(id as DepartmentId));
  const [transactions, setTransactions] = useState(getTransactionsByDepartment(id as DepartmentId));
  const [reportOpen, setReportOpen] = useState(false);
  const [departmentView, setDepartmentView] = useState<'global' | 'monthly'>('global');
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
  const previousMonthDate = now.getMonth() === 0
    ? new Date(now.getFullYear() - 1, 11, 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const getStatsFromTransactions = (items: typeof transactions) => {
    const income = items.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const externalIncome = items
      .filter((tx) => tx.type === 'income' && tx.incomeNature === 'external-contribution')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const operationalIncome = income - externalIncome;
    const expenses = items.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    return { income, externalIncome, operationalIncome, expenses, balance: income - expenses, count: items.length };
  };

  const currentMonthTransactions = transactions.filter((tx) => {
    const date = new Date(getTransactionTimestamp(tx.date));
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const previousMonthTransactions = transactions.filter((tx) => {
    const date = new Date(getTransactionTimestamp(tx.date));
    return date.getFullYear() === previousMonthDate.getFullYear() && date.getMonth() === previousMonthDate.getMonth();
  });

  const currentMonthStats = getStatsFromTransactions(currentMonthTransactions);
  const previousMonthStats = getStatsFromTransactions(previousMonthTransactions);
  const globalStockEconomics = getStockEconomicsSummary(dept.id);
  const monthlyStockEconomics = getStockEconomicsSummary(dept.id, now.getFullYear(), now.getMonth());
  const getAdjustedFormationMargin = (items: typeof transactions, trainingSupportCost: number, giftCost: number) => {
    const formationRevenue = items
      .filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category))
      .reduce((sum, tx) => sum + tx.amount, 0);
    return formationRevenue - trainingSupportCost - giftCost;
  };
  const cashResultExcludingExternal = stats.operationalIncome - stats.expenses;
  const adjustedActivityMargin = stats.operationalIncome - globalStockEconomics.totalConsumedCost;
  const adjustedFormationMargin = getAdjustedFormationMargin(transactions, globalStockEconomics.trainingSupportCost, globalStockEconomics.giftCost);
  const monthlyCashResultExcludingExternal = currentMonthStats.operationalIncome - currentMonthStats.expenses;
  const adjustedMonthlyActivityMargin = currentMonthStats.operationalIncome - monthlyStockEconomics.totalConsumedCost;
  const adjustedMonthlyFormationMargin = getAdjustedFormationMargin(currentMonthTransactions, monthlyStockEconomics.trainingSupportCost, monthlyStockEconomics.giftCost);

  const guimsEducPlans = dept.id === 'guims-educ'
    ? getPaymentPlans().filter((plan) => plan.departmentId === 'guims-educ' && plan.status === 'en_cours')
    : [] as PaymentPlan[];
  const guimsEducReminders = dept.id === 'guims-educ'
    ? getPaymentReminders().filter((item) => item.departmentId === 'guims-educ')
    : [];
  const guimsEducOverdue = dept.id === 'guims-educ'
    ? getOverdueTranches().filter((item) => item.departmentId === 'guims-educ')
    : [];
  const guimsEducTotalDue = guimsEducPlans.reduce((sum, plan) => sum + plan.totalAmount + (plan.inscriptionFee || 0), 0);
  const guimsEducTotalPaid = guimsEducPlans.reduce((sum, plan) => sum + getPaidAmount(plan) + (plan.inscriptionPaidAmount || (plan.inscriptionPaid && plan.inscriptionFee ? plan.inscriptionFee : 0)), 0);
  const guimsEducTotalRemaining = Math.max(0, guimsEducTotalDue - guimsEducTotalPaid);
  const guimsEducCategories = [...new Set(guimsEducPlans.map((plan) => (plan.guimsEducCategory || 'Non classé').trim() || 'Non classé'))].sort((a, b) => a.localeCompare(b));

  const openDetail = (detail: NonNullable<typeof metricDetail>) => setMetricDetail(detail);

  const computeTrend = (current: number, previous: number): number | null => {
    if (previous === 0) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 100);
  };

  const incomeTrend = computeTrend(currentMonthStats.income, previousMonthStats.income);
  const expenseTrend = computeTrend(currentMonthStats.expenses, previousMonthStats.expenses);
  const balanceTrend = computeTrend(currentMonthStats.balance, previousMonthStats.balance);

  const buildRealProfitReportOptions = () => {
    if (departmentView !== 'monthly') return undefined;
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { startDate, endDate };
  };

  const refresh = () => {
    setStats(getDepartmentStats(id as DepartmentId));
    setTransactions(getTransactionsByDepartment(id as DepartmentId));
  };

  const salaryOverrunCases = dept?.id === 'charges-entreprise'
    ? getEmployeesByDepartment('charges-entreprise')
      .map((employee) => ({ employee, status: getEmployeeSalaryStatus(employee) }))
      .filter(({ status }) => (status.monthlySalary || 0) > 0 && status.paidThisMonth > (status.monthlySalary || 0))
    : [];

  useEffect(() => {
    refresh();
  }, [id]);

  if (!dept) {
    return <div>Département non trouvé</div>;
  }

  if (!hasDepartmentAccess(getCurrentUser(), dept.id)) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Vous n'avez pas accès à ce département</p>
        <p className="text-sm">Contactez le Super Admin pour obtenir l'accès.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Department hero header */}
      <div className={`rounded-2xl ${dept.bgLightClass} p-4 sm:p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <img src={dept.logo} alt={dept.name} className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl object-cover shadow-md bg-card" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">{dept.name}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {departmentView === 'global' ? dept.description : `Vue mensuelle - ${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`}
              </p>
              <div className="mt-3 inline-flex rounded-lg border bg-background p-1">
                <Button
                  size="sm"
                  variant={departmentView === 'global' ? 'default' : 'ghost'}
                  onClick={() => setDepartmentView('global')}
                  className="h-8"
                >
                  Vue globale
                </Button>
                <Button
                  size="sm"
                  variant={departmentView === 'monthly' ? 'default' : 'ghost'}
                  onClick={() => setDepartmentView('monthly')}
                  className="h-8"
                >
                  Vue mensuelle
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
          {hasPermission(getCurrentUser(), 'canCreateTransaction') && (
            <Button size="sm" onClick={() => navigate(`/transaction/new?dept=${dept.id}`)} className="shadow-md">
              <Plus className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Nouvelle transaction</span><span className="sm:hidden">Nouveau</span>
            </Button>
          )}
          {STOCK_ENABLED_DEPARTMENT_IDS.includes(dept.id) && hasStockAccess(getCurrentUser(), dept.id) && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/${dept.id}/stock`)} className="shadow-md">
              <Package className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Gestion des stocks</span><span className="sm:hidden">Stocks</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setReportOpen(true)} className="shadow-md">
            <FileDown className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Rapport PDF</span><span className="sm:hidden">PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await downloadDepartmentRealProfitReport(dept.id, buildRealProfitReportOptions());
              toast.success('Rapport bénéfice réel généré');
            }}
            className="shadow-md"
          >
            <BadgeDollarSign className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Bénéfice réel</span><span className="sm:hidden">Bénéfice</span>
          </Button>
          {dept.id === 'charges-entreprise' && hasPermission(getCurrentUser(), 'canExportData') && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await downloadEmployeeSalaryReport();
                toast.success('Rapport salaires généré');
              }}
              className="shadow-md"
            >
              <FileDown className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Rapport salaires</span><span className="sm:hidden">Salaires</span>
            </Button>
          )}
          </div>
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        title={`Rapport — ${dept.name}`}
        onGenerate={async (opts) => { await downloadDepartmentReport(dept.id, opts); toast.success('Rapport généré'); }}
      />

      <MetricDetailDialog
        open={!!metricDetail}
        onOpenChange={(open) => !open && setMetricDetail(null)}
        title={metricDetail?.title || 'Détail'}
        description={metricDetail?.description || ''}
        summaryItems={metricDetail?.summaryItems || []}
        transactions={metricDetail?.transactions || []}
        showDepartment={metricDetail?.showDepartment ?? false}
        note={metricDetail?.note}
      />

      {departmentView === 'global' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Revenus" value={stats.income} icon={ArrowUpRight} colorClass="text-success" onClick={() => openDetail({ title: `Revenus — ${dept.name}`, description: 'Tous les revenus du département.', summaryItems: [{ label: 'Revenus totaux', value: stats.income }, { label: 'Revenus opérationnels', value: stats.operationalIncome }, { label: 'Apports externes', value: stats.externalIncome }], transactions: transactions.filter((tx) => tx.type === 'income'), showDepartment: false })} />
            <StatsCard title="Dépenses" value={stats.expenses} icon={ArrowDownRight} colorClass="text-destructive" onClick={() => openDetail({ title: `Dépenses — ${dept.name}`, description: 'Toutes les dépenses du département.', summaryItems: [{ label: 'Dépenses totales', value: stats.expenses }], transactions: transactions.filter((tx) => tx.type === 'expense'), showDepartment: false })} />
            <StatsCard title="Solde de caisse" value={stats.balance} icon={BadgeDollarSign} colorClass={stats.balance >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Solde de caisse — ${dept.name}`, description: 'Solde net de toutes les opérations du département.', summaryItems: [{ label: 'Revenus', value: stats.income }, { label: 'Dépenses', value: stats.expenses }, { label: 'Solde de caisse', value: stats.balance }], transactions, showDepartment: false })} />
            <StatsCard title="Marge activité ajustée" value={adjustedActivityMargin} icon={TrendingUp} colorClass={adjustedActivityMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Marge activité ajustée — ${dept.name}`, description: 'Revenus opérationnels moins le coût de stock consommé.', summaryItems: [{ label: 'Revenus opérationnels', value: stats.operationalIncome }, { label: 'Coût stock consommé', value: globalStockEconomics.totalConsumedCost }, { label: 'Marge ajustée', value: adjustedActivityMargin }], transactions, note: 'Le coût du stock est calculé depuis les mouvements de stock du département.', showDepartment: false })} />
            <StatsCard title="Transactions" value={stats.count} icon={Receipt} isCurrency={false} onClick={() => openDetail({ title: `Transactions — ${dept.name}`, description: 'Toutes les transactions du département.', summaryItems: [{ label: 'Transactions', value: stats.count, isCurrency: false }], transactions, showDepartment: false })} />
          </div>

          <Collapsible open={globalMetricsOpen} onOpenChange={setGlobalMetricsOpen} className="rounded-2xl border bg-card/60 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Indicateurs détaillés</p>
                <p className="text-xs text-muted-foreground">Apports externes, marges spécifiques, coût de stock et solde brut.</p>
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
                <StatsCard title="Apports externes" value={stats.externalIncome} icon={HandCoins} colorClass="text-primary" onClick={() => openDetail({ title: `Apports externes — ${dept.name}`, description: 'Tous les apports externes du département.', summaryItems: [{ label: 'Total apports externes', value: stats.externalIncome }], transactions: transactions.filter((tx) => tx.type === 'income' && tx.incomeNature === 'external-contribution'), showDepartment: false })} />
                <StatsCard title="Marge ventes stock" value={globalStockEconomics.soldGrossMargin} icon={PackageOpen} colorClass={globalStockEconomics.soldGrossMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Marge ventes stock — ${dept.name}`, description: 'Ventes de stock liées au département.', summaryItems: [{ label: 'Revenu stock vendu', value: globalStockEconomics.soldRevenue }, { label: 'Coût stock vendu', value: globalStockEconomics.soldCost }, { label: 'Marge brute', value: globalStockEconomics.soldGrossMargin }], transactions: transactions.filter((tx) => tx.type === 'income' && isStockSaleTransaction(tx)), note: 'Le coût exact du stock est visible dans la page Stock du département.', showDepartment: false })} />
                <StatsCard title="Marge formation ajustée" value={adjustedFormationMargin} icon={TrendingUp} colorClass={adjustedFormationMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Marge formation ajustée — ${dept.name}`, description: 'Revenus de formation moins les supports et cadeaux consommés.', summaryItems: [{ label: 'Revenus formation', value: transactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)).reduce((sum, tx) => sum + tx.amount, 0) }, { label: 'Supports formation', value: globalStockEconomics.trainingSupportCost }, { label: 'Cadeaux', value: globalStockEconomics.giftCost }, { label: 'Marge formation', value: adjustedFormationMargin }], transactions: transactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)), showDepartment: false })} />
                <StatsCard title="Coût stock consommé" value={globalStockEconomics.totalConsumedCost} icon={PackageOpen} colorClass="text-amber-600" onClick={() => openDetail({ title: `Coût stock consommé — ${dept.name}`, description: 'Synthèse des consommations de stock du département.', summaryItems: [{ label: 'Coût stock consommé', value: globalStockEconomics.totalConsumedCost }, { label: 'Marge ventes stock', value: globalStockEconomics.soldGrossMargin }, { label: 'Coût supports formation', value: globalStockEconomics.trainingSupportCost + globalStockEconomics.giftCost }], transactions, note: 'Le détail complet des mouvements est accessible dans la page Stock.', showDepartment: false })} />
                <StatsCard title="Solde" value={stats.balance} icon={TrendingUp} colorClass={stats.balance >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Solde — ${dept.name}`, description: 'Solde net du département.', summaryItems: [{ label: 'Revenus', value: stats.income }, { label: 'Dépenses', value: stats.expenses }, { label: 'Solde', value: stats.balance }], transactions, showDepartment: false })} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {focus === 'salary-overrun' && dept.id === 'charges-entreprise' && salaryOverrunCases.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Cas signalés: dépassements salariaux</h4>
              <div className="space-y-1.5 text-xs">
                {salaryOverrunCases.map(({ employee, status }) => (
                  <div key={employee.id} className="rounded border border-destructive/30 px-2 py-1 flex items-center justify-between gap-2">
                    <span><strong>{employee.fullName}</strong> — payé {status.paidThisMonth.toLocaleString('fr-FR')} FCFA / salaire {(status.monthlySalary || 0).toLocaleString('fr-FR')} FCFA</span>
                    <span className="text-destructive font-semibold">+{(status.paidThisMonth - (status.monthlySalary || 0)).toLocaleString('fr-FR')} FCFA</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dept.id === 'charges-entreprise' && <EmployeeDirectory departmentId={dept.id} />}
          {dept.id === 'charges-entreprise' && <EmployeeSalaryForecast />}

          {dept.id === 'guims-educ' && (
            <Card className="border-primary/30 bg-primary/5 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Suivi Guims Educ</CardTitle>
                    <p className="text-sm text-muted-foreground">Créer un programme avant inscription puis suivre les paiements parent par parent.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/formations?dept=guims-educ&open=create')}>
                      Créer un programme
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/formations?dept=guims-educ')}>
                      Voir les programmes
                    </Button>
                    <Button size="sm" onClick={() => navigate('/paiements?focus=guims-educ-reminders')}>
                      Suivi paiements
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Programmes actifs</p>
                    <p className="text-xl font-bold">{guimsEducPlans.length}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">À encaisser</p>
                    <p className="text-xl font-bold text-destructive">{formatCurrency(guimsEducTotalRemaining)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Échéances / retard</p>
                    <p className="text-xl font-bold text-amber-600">{guimsEducReminders.length} / {guimsEducOverdue.length}</p>
                  </div>
                </div>

                {guimsEducCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {guimsEducCategories.map((category) => (
                      <Badge key={category} variant="secondary">{category}</Badge>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border overflow-x-auto bg-background">
                  <Table className="min-w-[900px] text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Élève</TableHead>
                        <TableHead>Inscription</TableHead>
                        <TableHead>Programme</TableHead>
                        <TableHead>Reste</TableHead>
                        <TableHead>Prochaine échéance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {guimsEducPlans.slice(0, 8).map((plan) => {
                        const alloc = getAllocationSummary(plan);
                        const next = alloc.find((item) => item.status !== 'paid');
                        const nextTranche = next && plan.scheduledTranches?.find((tr) => tr.name === next.name);
                        const inscriptionPaid = plan.inscriptionPaidAmount || (plan.inscriptionPaid && plan.inscriptionFee ? plan.inscriptionFee : 0);
                        return (
                          <TableRow key={plan.id}>
                            <TableCell>{plan.guimsEducCategory || 'Non classé'}</TableCell>
                            <TableCell className="font-medium">{plan.parentName || plan.clientName}</TableCell>
                            <TableCell>{plan.studentName || '—'}</TableCell>
                            <TableCell>{plan.inscriptionFee ? `${inscriptionPaid >= plan.inscriptionFee ? 'Payée' : 'En cours'} (${formatCurrency(inscriptionPaid)}/${formatCurrency(plan.inscriptionFee)})` : '—'}</TableCell>
                            <TableCell>{plan.label}</TableCell>
                            <TableCell className="font-semibold text-destructive">{formatCurrency(getRemainingAmount(plan))}</TableCell>
                            <TableCell>{nextTranche ? `${nextTranche.name} · ${new Date(nextTranche.dueDate).toLocaleDateString('fr-FR')}` : 'Soldé'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <FinanceChart transactions={transactions} title={`Analyse globale - ${dept.name}`} />

          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">Transactions globales</h3>
            <TransactionList transactions={transactions} onDelete={refresh} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">Vue mensuelle du département</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Revenus du mois" value={currentMonthStats.income} icon={ArrowUpRight} colorClass="text-success" trend={incomeTrend} onClick={() => openDetail({ title: `Revenus du mois — ${dept.name}`, description: 'Tous les revenus enregistrés pendant le mois courant.', summaryItems: [{ label: 'Revenus du mois', value: currentMonthStats.income }, { label: 'Apports externes', value: currentMonthStats.externalIncome }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income'), showDepartment: false })} />
            <StatsCard title="Dépenses du mois" value={currentMonthStats.expenses} icon={ArrowDownRight} colorClass="text-destructive" trend={expenseTrend} invertTrend onClick={() => openDetail({ title: `Dépenses du mois — ${dept.name}`, description: 'Toutes les dépenses du mois courant.', summaryItems: [{ label: 'Dépenses du mois', value: currentMonthStats.expenses }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'expense'), showDepartment: false })} />
            <StatsCard title="Solde du mois" value={currentMonthStats.balance} icon={BadgeDollarSign} colorClass={currentMonthStats.balance >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Solde du mois — ${dept.name}`, description: 'Solde net du mois courant.', summaryItems: [{ label: 'Revenus', value: currentMonthStats.income }, { label: 'Dépenses', value: currentMonthStats.expenses }, { label: 'Solde', value: currentMonthStats.balance }], transactions: currentMonthTransactions, showDepartment: false })} />
            <StatsCard title="Marge activité ajustée" value={adjustedMonthlyActivityMargin} icon={TrendingUp} colorClass={adjustedMonthlyActivityMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Marge activité ajustée du mois — ${dept.name}`, description: 'Revenus opérationnels du mois moins le coût de stock consommé.', summaryItems: [{ label: 'Revenus opérationnels', value: currentMonthStats.operationalIncome }, { label: 'Coût stock consommé', value: monthlyStockEconomics.totalConsumedCost }, { label: 'Marge ajustée', value: adjustedMonthlyActivityMargin }], transactions: currentMonthTransactions, note: 'Le coût de stock est calculé à partir des mouvements du mois.', showDepartment: false })} />
            <StatsCard title="Transactions du mois" value={currentMonthStats.count} icon={Receipt} isCurrency={false} onClick={() => openDetail({ title: `Transactions du mois — ${dept.name}`, description: 'Toutes les transactions du mois courant.', summaryItems: [{ label: 'Transactions du mois', value: currentMonthStats.count, isCurrency: false }], transactions: currentMonthTransactions, showDepartment: false })} />
          </div>

          <Collapsible open={monthlyMetricsOpen} onOpenChange={setMonthlyMetricsOpen} className="rounded-2xl border bg-muted/30 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Détails mensuels</p>
                <p className="text-xs text-muted-foreground">Apports externes, marges détaillées, coût de stock et solde brut du mois.</p>
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
                <StatsCard title="Apports externes" value={currentMonthStats.externalIncome} icon={HandCoins} colorClass="text-primary" onClick={() => openDetail({ title: `Apports externes du mois — ${dept.name}`, description: 'Apports externes enregistrés pendant le mois courant.', summaryItems: [{ label: 'Total apports externes', value: currentMonthStats.externalIncome }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income' && tx.incomeNature === 'external-contribution'), showDepartment: false })} />
                <StatsCard title="Marge ventes stock" value={monthlyStockEconomics.soldGrossMargin} icon={PackageOpen} colorClass={monthlyStockEconomics.soldGrossMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Marge ventes stock du mois — ${dept.name}`, description: 'Ventes de stock du mois et coût d’achat associé.', summaryItems: [{ label: 'Revenu stock vendu', value: monthlyStockEconomics.soldRevenue }, { label: 'Coût stock vendu', value: monthlyStockEconomics.soldCost }, { label: 'Marge brute', value: monthlyStockEconomics.soldGrossMargin }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income' && isStockSaleTransaction(tx)), showDepartment: false })} />
                <StatsCard title="Marge formation ajustée" value={adjustedMonthlyFormationMargin} icon={TrendingUp} colorClass={adjustedMonthlyFormationMargin >= 0 ? "text-success" : "text-destructive"} onClick={() => openDetail({ title: `Marge formation ajustée du mois — ${dept.name}`, description: 'Revenus formation du mois moins supports et cadeaux.', summaryItems: [{ label: 'Revenus formation', value: currentMonthTransactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)).reduce((sum, tx) => sum + tx.amount, 0) }, { label: 'Supports formation', value: monthlyStockEconomics.trainingSupportCost }, { label: 'Cadeaux', value: monthlyStockEconomics.giftCost }, { label: 'Marge formation', value: adjustedMonthlyFormationMargin }], transactions: currentMonthTransactions.filter((tx) => tx.type === 'income' && tx.incomeNature !== 'external-contribution' && isFormationRevenueCategory(tx.category)), showDepartment: false })} />
                <StatsCard title="Coût stock consommé" value={monthlyStockEconomics.totalConsumedCost} icon={PackageOpen} colorClass="text-amber-600" onClick={() => openDetail({ title: `Coût stock consommé du mois — ${dept.name}`, description: 'Synthèse des consommations de stock du mois.', summaryItems: [{ label: 'Coût stock consommé', value: monthlyStockEconomics.totalConsumedCost }, { label: 'Marge ventes stock', value: monthlyStockEconomics.soldGrossMargin }, { label: 'Coût supports formation', value: monthlyStockEconomics.trainingSupportCost + monthlyStockEconomics.giftCost }], transactions: currentMonthTransactions, note: 'Le détail complet des mouvements est accessible dans la page Stock.', showDepartment: false })} />
                <StatsCard title="Solde du mois" value={currentMonthStats.balance} icon={TrendingUp} colorClass={currentMonthStats.balance >= 0 ? "text-success" : "text-destructive"} trend={balanceTrend} onClick={() => openDetail({ title: `Solde du mois — ${dept.name}`, description: 'Solde net du mois courant.', summaryItems: [{ label: 'Revenus', value: currentMonthStats.income }, { label: 'Dépenses', value: currentMonthStats.expenses }, { label: 'Solde', value: currentMonthStats.balance }], transactions: currentMonthTransactions, showDepartment: false })} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {currentMonthTransactions.length > 0 ? (
            <>
              <FinanceChart transactions={currentMonthTransactions} title={`Analyse mensuelle - ${dept.name}`} />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Transactions du mois</h3>
                <TransactionList transactions={currentMonthTransactions} onDelete={refresh} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune transaction enregistrée pour ce mois dans ce département.</p>
          )}
        </div>
      )}
    </div>
  );
}
