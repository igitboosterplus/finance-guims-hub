import { getTransactions, getMonthlyStats, getStatsByPaymentMethod } from "./data";
import { getEmployeesByDepartment, getEmployeeSalaryStatus } from "./employees";
import { getOverdueTranches } from "./stock";
import { getTransactionTimestamp } from "./transactionDates";

export type ControlAlertSeverity = "high" | "medium" | "low";

export interface ControlAlert {
  id: string;
  severity: ControlAlertSeverity;
  title: string;
  details: string;
  actionLabel: string;
  actionPath: string;
}

function toDayKey(value: string): string {
  const date = new Date(getTransactionTimestamp(value));
  return Number.isNaN(date.getTime()) ? "invalid" : date.toISOString().slice(0, 10);
}

export function getTreasuryControlAlerts(): ControlAlert[] {
  const alerts: ControlAlert[] = [];
  const txs = getTransactions();

  const duplicateMap = new Map<string, number>();
  for (const tx of txs) {
    const key = [
      toDayKey(tx.date),
      tx.type,
      tx.departmentId,
      tx.category.trim().toLowerCase(),
      (tx.personName || "").trim().toLowerCase(),
      String(tx.amount),
    ].join("|");
    duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
  }

  const duplicateCount = [...duplicateMap.values()].filter((count) => count > 1).length;
  if (duplicateCount > 0) {
    alerts.push({
      id: "dup-tx",
      severity: "high",
      title: "Transactions potentiellement dupliquées",
      details: `${duplicateCount} signature(s) de transaction apparaissent plusieurs fois le même jour.`,
      actionLabel: "Vérifier le journal d'audit",
      actionPath: "/audit?focus=dup-tx",
    });
  }

  const now = new Date();
  const monthStats = getMonthlyStats(now.getFullYear(), now.getMonth());
  if (monthStats.expenses > monthStats.income && monthStats.income > 0) {
    alerts.push({
      id: "monthly-deficit",
      severity: "high",
      title: "Déficit mensuel",
      details: `Les dépenses du mois dépassent les revenus de ${monthStats.expenses - monthStats.income} FCFA.`,
      actionLabel: "Analyser les paiements",
      actionPath: "/paiements?focus=monthly-deficit",
    });
  }

  const paymentStats = getStatsByPaymentMethod();
  const totalFlow = paymentStats.reduce((sum, item) => sum + item.income + item.expenses, 0);
  const dominant = [...paymentStats].sort((a, b) => (b.income + b.expenses) - (a.income + a.expenses))[0];
  if (dominant && totalFlow > 0) {
    const share = (dominant.income + dominant.expenses) / totalFlow;
    if (share >= 0.65) {
      alerts.push({
        id: "cash-concentration",
        severity: "medium",
        title: "Concentration des flux sur une caisse",
        details: `${dominant.label} concentre ${Math.round(share * 100)}% des flux.`,
        actionLabel: "Consulter les opérations",
        actionPath: "/audit?focus=cash-concentration",
      });
    }
  }

  const monthExpenses = txs.filter((tx) => {
    if (tx.type !== "expense") return false;
    const date = new Date(getTransactionTimestamp(tx.date));
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const avgExpense = monthExpenses.length > 0
    ? monthExpenses.reduce((sum, tx) => sum + tx.amount, 0) / monthExpenses.length
    : 0;
  const largeExpenses = monthExpenses.filter((tx) => avgExpense > 0 && tx.amount >= avgExpense * 2);
  if (largeExpenses.length > 0) {
    alerts.push({
      id: "unusual-expenses",
      severity: "medium",
      title: "Dépenses atypiques détectées",
      details: `${largeExpenses.length} dépense(s) >= 2x la moyenne mensuelle.`,
      actionLabel: "Examiner les dépenses",
      actionPath: "/audit?focus=unusual-expenses",
    });
  }

  const salaryOverruns = getEmployeesByDepartment("charges-entreprise")
    .map((employee) => ({ employee, status: getEmployeeSalaryStatus(employee) }))
    .filter(({ status }) => (status.monthlySalary || 0) > 0 && status.paidThisMonth > (status.monthlySalary || 0));

  if (salaryOverruns.length > 0) {
    alerts.push({
      id: "salary-overrun",
      severity: "high",
      title: "Dépassement de salaires",
      details: `${salaryOverruns.length} employé(s) dépassent déjà leur plafond salarial mensuel.`,
      actionLabel: "Ouvrir le département RH",
      actionPath: "/department/charges-entreprise?focus=salary-overrun",
    });
  }

  const guimsEducOverdue = getOverdueTranches().filter((item) => item.departmentId === "guims-educ");
  if (guimsEducOverdue.length > 0) {
    const overdueTotal = guimsEducOverdue.reduce((sum, item) => sum + item.trancheAmount, 0);
    alerts.push({
      id: "guims-educ-overdue",
      severity: "high",
      title: "Guims Educ: mensualites en retard",
      details: `${guimsEducOverdue.length} mensualite(s) non reglee(s), soit ${overdueTotal} FCFA a relancer.`,
      actionLabel: "Ouvrir les rappels Guims Educ",
      actionPath: "/paiements?focus=guims-educ-reminders",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-good",
      severity: "low",
      title: "Aucune anomalie majeure",
      details: "Les contrôles automatiques n'ont pas trouvé d'écart critique.",
      actionLabel: "Voir le Super Audit",
      actionPath: "/super-audit?focus=all-good",
    });
  }

  return alerts.slice(0, 6);
}
