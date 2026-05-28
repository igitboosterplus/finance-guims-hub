import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, Plus, Package, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { ReportDialog } from "@/components/ReportDialog";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { EmployeeSalaryForecast } from "@/components/EmployeeSalaryForecast";
import { getDepartment, getDepartmentStats, getTransactionsByDepartment, STOCK_ENABLED_DEPARTMENT_IDS, type DepartmentId } from "@/lib/data";
import { getCurrentUser, hasDepartmentAccess, hasPermission, hasStockAccess } from "@/lib/auth";
import { downloadDepartmentReport, downloadEmployeeSalaryReport } from "@/lib/reports";
import { toast } from "sonner";
import { getTransactionTimestamp } from "@/lib/transactionDates";
import { getEmployeesByDepartment, getEmployeeSalaryStatus } from "@/lib/employees";

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

  const now = new Date();
  const previousMonthDate = now.getMonth() === 0
    ? new Date(now.getFullYear() - 1, 11, 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const getStatsFromTransactions = (items: typeof transactions) => {
    const income = items.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const expenses = items.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    return { income, expenses, balance: income - expenses, count: items.length };
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

  const computeTrend = (current: number, previous: number): number | null => {
    if (previous === 0) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 100);
  };

  const incomeTrend = computeTrend(currentMonthStats.income, previousMonthStats.income);
  const expenseTrend = computeTrend(currentMonthStats.expenses, previousMonthStats.expenses);
  const balanceTrend = computeTrend(currentMonthStats.balance, previousMonthStats.balance);

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

      {departmentView === 'global' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Revenus" value={stats.income} icon={ArrowUpRight} colorClass="text-success" />
            <StatsCard title="Dépenses" value={stats.expenses} icon={ArrowDownRight} colorClass="text-destructive" />
            <StatsCard title="Solde" value={stats.balance} icon={TrendingUp} colorClass={stats.balance >= 0 ? "text-success" : "text-destructive"} />
            <StatsCard title="Transactions" value={stats.count} icon={Receipt} isCurrency={false} />
          </div>

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
            <StatsCard title="Revenus du mois" value={currentMonthStats.income} icon={ArrowUpRight} colorClass="text-success" trend={incomeTrend} />
            <StatsCard title="Dépenses du mois" value={currentMonthStats.expenses} icon={ArrowDownRight} colorClass="text-destructive" trend={expenseTrend} invertTrend />
            <StatsCard title="Solde du mois" value={currentMonthStats.balance} icon={TrendingUp} colorClass={currentMonthStats.balance >= 0 ? "text-success" : "text-destructive"} trend={balanceTrend} />
            <StatsCard title="Transactions du mois" value={currentMonthStats.count} icon={Receipt} isCurrency={false} />
          </div>

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
