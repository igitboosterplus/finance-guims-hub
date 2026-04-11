import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, Plus, Package, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { ReportDialog } from "@/components/ReportDialog";
import { getDepartment, getDepartmentStats, getTransactionsByDepartment, type DepartmentId } from "@/lib/data";
import { getCurrentUser, hasDepartmentAccess, hasPermission } from "@/lib/auth";
import { downloadDepartmentReport } from "@/lib/reports";
import type { ReportOptions } from "@/lib/reports";
import { toast } from "sonner";

export default function DepartmentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dept = getDepartment(id as DepartmentId);

  const [stats, setStats] = useState(getDepartmentStats(id as DepartmentId));
  const [transactions, setTransactions] = useState(getTransactionsByDepartment(id as DepartmentId));
  const [reportOpen, setReportOpen] = useState(false);

  const refresh = () => {
    setStats(getDepartmentStats(id as DepartmentId));
    setTransactions(getTransactionsByDepartment(id as DepartmentId));
  };

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
              <p className="text-xs sm:text-sm text-muted-foreground">{dept.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
          {hasPermission(getCurrentUser(), 'canCreateTransaction') && (
            <Button size="sm" onClick={() => navigate(`/transaction/new?dept=${dept.id}`)} className="shadow-md">
              <Plus className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Nouvelle transaction</span><span className="sm:hidden">Nouveau</span>
            </Button>
          )}
          {(dept.id === 'gaba' || dept.id === 'guims-academy') && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/${dept.id}/stock`)} className="shadow-md">
              <Package className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Gestion des stocks</span><span className="sm:hidden">Stocks</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setReportOpen(true)} className="shadow-md">
            <FileDown className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Rapport PDF</span><span className="sm:hidden">PDF</span>
          </Button>
          </div>
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        title={`Rapport — ${dept.name}`}
        onGenerate={(opts) => { downloadDepartmentReport(dept.id, opts); toast.success('Rapport PDF téléchargé'); }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Revenus" value={stats.income} icon={ArrowUpRight} colorClass="text-success" />
        <StatsCard title="Dépenses" value={stats.expenses} icon={ArrowDownRight} colorClass="text-destructive" />
        <StatsCard title="Solde" value={stats.balance} icon={TrendingUp} colorClass={stats.balance >= 0 ? "text-success" : "text-destructive"} />
        <StatsCard title="Transactions" value={stats.count} icon={Receipt} isCurrency={false} />
      </div>

      <FinanceChart transactions={transactions} title={`Analyse - ${dept.name}`} />

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Transactions</h3>
        <TransactionList transactions={transactions} onDelete={refresh} />
      </div>
    </div>
  );
}
