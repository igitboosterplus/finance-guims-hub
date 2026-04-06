import { useState, useEffect, useRef } from "react";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Receipt, Download, Upload, Wallet, Smartphone, Building2, Banknote, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { DepartmentCard } from "@/components/DepartmentCard";
import { TransactionList } from "@/components/TransactionList";
import { FinanceChart } from "@/components/FinanceChart";
import { departments, getGlobalStats, getTransactions, getStatsByPaymentMethod, exportDataJSON, importDataJSON } from "@/lib/data";
import { getCurrentUser, hasPermission, hasDepartmentAccess } from "@/lib/auth";
import { toast } from "sonner";
import { downloadDashboardReport } from "@/lib/reports";
import logoGuimsGroup from "@/assets/logo-guims-group.jpg";

export default function Dashboard() {
  const [stats, setStats] = useState(getGlobalStats());
  const [transactions, setTransactions] = useState(getTransactions());
  const [paymentStats, setPaymentStats] = useState(getStatsByPaymentMethod());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setStats(getGlobalStats());
    setTransactions(getTransactions());
    setPaymentStats(getStatsByPaymentMethod());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleExportJSON = () => {
    const json = exportDataJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guims-finance-backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Sauvegarde téléchargée");
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = importDataJSON(ev.target?.result as string);
      if (result.success) {
        toast.success(`${result.count} transactions restaurées`);
        refresh();
      } else {
        toast.error(result.error || "Erreur d'importation");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 flex items-center gap-5">
        <img src={logoGuimsGroup} alt="Guims Group" className="h-16 w-16 rounded-2xl object-cover shadow-md hidden sm:block" />
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground">Tableau de bord</h2>
          <p className="text-muted-foreground text-sm">Vue globale des finances de Guims Group</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { downloadDashboardReport(); toast.success('Rapport PDF téléchargé'); }}>
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Rapport PDF</span>
          </Button>
          {hasPermission(getCurrentUser(), 'canExportData') && (
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExportJSON}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Sauvegarder</span>
            </Button>
          )}
          {hasPermission(getCurrentUser(), 'canImportData') && (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Restaurer</span>
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
            </>
          )}
        </div>
      </div>

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
        <TransactionList transactions={transactions.slice(-10)} onDelete={refresh} showDepartment />
      </div>
    </div>
  );
}
