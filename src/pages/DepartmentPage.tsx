import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, Plus, Package, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { getDepartment, getDepartmentStats, getTransactionsByDepartment, type DepartmentId } from "@/lib/data";
import { getCurrentUser, hasDepartmentAccess, hasPermission } from "@/lib/auth";
import { downloadDepartmentReport } from "@/lib/reports";
import { toast } from "sonner";

export default function DepartmentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dept = getDepartment(id as DepartmentId);

  const [stats, setStats] = useState(getDepartmentStats(id as DepartmentId));
  const [transactions, setTransactions] = useState(getTransactionsByDepartment(id as DepartmentId));

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
    <div className="space-y-8">
      {/* Department hero header */}
      <div className={`rounded-2xl ${dept.bgLightClass} p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={dept.logo} alt={dept.name} className="h-16 w-16 rounded-2xl object-cover shadow-md bg-card" />
            <div>
              <h2 className="text-2xl font-bold text-foreground">{dept.name}</h2>
              <p className="text-sm text-muted-foreground">{dept.description}</p>
            </div>
          </div>
          {hasPermission(getCurrentUser(), 'canCreateTransaction') && (
            <Button onClick={() => navigate(`/transaction/new?dept=${dept.id}`)} className="shadow-md">
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle transaction
            </Button>
          )}
          {dept.id === 'gaba' && (
            <Button variant="outline" onClick={() => navigate('/gaba/stock')} className="shadow-md">
              <Package className="h-4 w-4 mr-2" />
              Gestion des stocks
            </Button>
          )}
          <Button variant="outline" onClick={() => { downloadDepartmentReport(dept.id); toast.success('Rapport PDF téléchargé'); }} className="shadow-md">
            <FileDown className="h-4 w-4 mr-2" />
            Rapport PDF
          </Button>
        </div>
      </div>

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
