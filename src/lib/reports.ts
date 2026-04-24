import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoGuimsGroup from "@/assets/logo-guims-group.jpg";
import logoGaba from "@/assets/logo-gaba.png";
import logoGuimsEduc from "@/assets/logo-guims-educ.jpg";
import logoGuimsAcademy from "@/assets/logo-guims-academy.jpg";
import logoDigitbooster from "@/assets/logo-digitbooster.png";
import {
  departments, getTransactions, getGlobalStats, getDepartmentStats,
  getTransactionsByDepartment, getDepartment, formatCurrency,
  getPaymentMethodLabel, getStatsByPaymentMethod, type DepartmentId, type Transaction,
} from "./data";
import { getStockItems, getStockMovements, getCategoryLabel, getStockStats, getTrainings, getMovementTypeLabel } from "./stock";
import { getAuditLog, buildHumanDiff } from "./auth";
import { generateExternalAIInsights, type AIProvider, type AIReportPayload, type InsightSection } from "./aiReports";

// ==================== HELPERS ====================

export interface ReportOptions {
  startDate?: string;
  endDate?: string;
  personName?: string;
  useAI?: boolean;
  aiProvider?: AIProvider;
  reportMode?: "download" | "preview";
}

interface CategoryBreakdownItem {
  label: string;
  amount: number;
  share: number;
  count: number;
}

const STRATEGIC_EXPENSE_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: "Salaires et paiements du personnel", keywords: ["salaire", "employe", "employé", "paie", "payroll", "remuneration", "rémunération", "honoraires"] },
  { label: "Connexion et communication", keywords: ["connexion", "internet", "wifi", "forfait", "data", "communication", "facebook"] },
  { label: "Publicité et visibilité", keywords: ["publicité", "boost", "publication", "marketing"] },
  { label: "Hébergement et outils digitaux", keywords: ["hébergement", "outil", "site web", "digital"] },
  { label: "Transport et déplacement", keywords: ["transport", "déplacement"] },
  { label: "Matériel et logistique", keywords: ["matériel", "pédagogique", "composants"] },
  { label: "Formation et salle", keywords: ["formateur", "salle", "formation"] },
  { label: "Achats et approvisionnement", keywords: ["achat", "géniteurs", "intrants", "hébergement"] },
];

function filterByPeriod<T extends { date: string }>(items: T[], opts?: ReportOptions): T[] {
  const start = opts?.startDate ? new Date(`${opts.startDate}T00:00:00`) : null;
  const end = opts?.endDate ? new Date(`${opts.endDate}T23:59:59.999`) : null;

  return items.filter(item => {
    const dt = new Date(item.date);
    if (Number.isNaN(dt.getTime())) return false;
    if (start && dt < start) return false;
    if (end && dt > end) return false;
    return true;
  });
}

function filterTransactions(txs: Transaction[], opts?: ReportOptions): Transaction[] {
  let result = filterByPeriod(txs, opts);
  if (opts?.personName) {
    const name = opts.personName.toLowerCase();
    result = result.filter(t => (t.personName || '').toLowerCase().includes(name));
  }
  return result;
}

function shouldUseExternalAI(opts?: ReportOptions): boolean {
  return opts?.useAI !== false;
}

function periodLabel(opts?: ReportOptions): string {
  let label = '';
  if (opts?.startDate && opts?.endDate) label = `Du ${new Date(opts.startDate).toLocaleDateString("fr-FR")} au ${new Date(opts.endDate).toLocaleDateString("fr-FR")}`;
  else if (opts?.startDate) label = `À partir du ${new Date(opts.startDate).toLocaleDateString("fr-FR")}`;
  else if (opts?.endDate) label = `Jusqu'au ${new Date(opts.endDate).toLocaleDateString("fr-FR")}`;
  else label = "Toutes les dates";
  if (opts?.personName) label += ` · Personne : ${opts.personName}`;
  return label;
}

async function toDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function setupDoc(title: string, opts?: ReportOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFillColor(18, 52, 78);
  doc.rect(0, 0, 297, 210, "F");
  doc.setFillColor(31, 91, 134);
  doc.rect(0, 150, 297, 60, "F");

  const logos = [logoGuimsGroup, logoGaba, logoGuimsEduc, logoGuimsAcademy, logoDigitbooster];
  const logoPositions = [30, 85, 140, 195, 250];
  for (let i = 0; i < logos.length; i++) {
    const imageData = await toDataUrl(logos[i]);
    if (!imageData) continue;
    const format = imageData.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(imageData, format, logoPositions[i], 22, 18, 18);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("GUIMS GROUP", 148.5, 72, { align: "center" });
  doc.setFontSize(17);
  doc.text("Cahier de Presentation des Rapports Financiers", 148.5, 84, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text(title, 148.5, 102, { align: "center" });
  doc.setFontSize(10);
  doc.text(periodLabel(opts), 148.5, 114, { align: "center" });
  doc.text(`Genere le ${new Date().toLocaleDateString("fr-FR")} a ${new Date().toLocaleTimeString("fr-FR")}`, 148.5, 124, { align: "center" });

  doc.setTextColor(230, 240, 248);
  doc.setFontSize(11);
  doc.text("Document de pilotage interne - Finance Hub", 148.5, 173, { align: "center" });
  doc.text("Confidentiel - Usage strictement interne", 148.5, 183, { align: "center" });

  doc.addPage();
  return doc;
}

function decoratePages(doc: jsPDF, title: string): void {
  const totalPages = doc.getNumberOfPages();
  for (let page = 2; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setDrawColor(52, 94, 128);
    doc.setLineWidth(0.4);
    doc.line(12, 12, 285, 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(34, 87, 122);
    doc.text("Guims Group - Finance Hub", 14, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(title, 283, 9, { align: "right" });

    doc.setDrawColor(180, 190, 198);
    doc.line(12, 198, 285, 198);
    doc.setTextColor(95);
    doc.setFontSize(8.5);
    doc.text("Confidentiel - Guims Group", 14, 203);
    doc.text(`Page ${page - 1} / ${Math.max(totalPages - 1, 1)}`, 283, 203, { align: "right" });
  }
}

function presentPdf(doc: jsPDF, filename: string, mode: "download" | "preview" = "download"): void {
  if (mode === "preview") {
    const blobUrl = doc.output("bloburl");
    const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      doc.save(filename);
    }
    return;
  }
  doc.save(filename);
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return y + 6;
}

function fmtAmount(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return sign + formatted + " FCFA";
}

function safeRatio(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function buildCategoryBreakdown(txs: Transaction[], type: 'income' | 'expense'): CategoryBreakdownItem[] {
  const scoped = txs.filter(tx => tx.type === type);
  const total = scoped.reduce((sum, tx) => sum + tx.amount, 0);
  const grouped = new Map<string, { amount: number; count: number }>();

  for (const tx of scoped) {
    const current = grouped.get(tx.category) || { amount: 0, count: 0 };
    current.amount += tx.amount;
    current.count += 1;
    grouped.set(tx.category, current);
  }

  return [...grouped.entries()]
    .map(([label, value]) => ({ label, amount: value.amount, count: value.count, share: safeRatio(value.amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

function getStrategicExpenseLabel(category: string): string {
  const normalized = category.toLowerCase();
  const match = STRATEGIC_EXPENSE_RULES.find(rule => rule.keywords.some(keyword => normalized.includes(keyword)));
  return match?.label || "Autres dépenses";
}

function buildStrategicExpenseBreakdown(txs: Transaction[]): CategoryBreakdownItem[] {
  const expenses = txs.filter(tx => tx.type === 'expense');
  const total = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const grouped = new Map<string, { amount: number; count: number }>();

  for (const tx of expenses) {
    const label = getStrategicExpenseLabel(tx.category);
    const current = grouped.get(label) || { amount: 0, count: 0 };
    current.amount += tx.amount;
    current.count += 1;
    grouped.set(label, current);
  }

  return [...grouped.entries()]
    .map(([label, value]) => ({ label, amount: value.amount, count: value.count, share: safeRatio(value.amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

function getPayrollExpenseSummary(txs: Transaction[]): CategoryBreakdownItem | null {
  return buildStrategicExpenseBreakdown(txs).find(item => item.label === "Salaires et paiements du personnel") || null;
}

function topCategoryLabel(txs: Transaction[], type: 'income' | 'expense'): { label: string; amount: number; share: number } | null {
  const scoped = txs.filter(tx => tx.type === type);
  if (scoped.length === 0) return null;
  const totals = new Map<string, number>();
  for (const tx of scoped) {
    totals.set(tx.category, (totals.get(tx.category) || 0) + tx.amount);
  }
  const topEntry = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!topEntry) return null;
  const total = scoped.reduce((sum, tx) => sum + tx.amount, 0);
  return { label: topEntry[0], amount: topEntry[1], share: safeRatio(topEntry[1], total) };
}

function buildTransactionInsights(txs: Transaction[], contextLabel: string): InsightSection {
  const stats = computeStats(txs);
  const payStats = getStatsByPaymentMethod(txs);
  const topIncome = topCategoryLabel(txs, 'income');
  const topExpense = topCategoryLabel(txs, 'expense');
  const payrollSummary = getPayrollExpenseSummary(txs);
  const missingPhoneCount = txs.filter(tx => tx.type === 'income' && !tx.phoneNumber).length;
  const missingDescriptionCount = txs.filter(tx => !tx.description?.trim()).length;
  const recentTxs = [...txs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const paymentLeader = [...payStats].sort((a, b) => b.balance - a.balance)[0];

  const overview: string[] = [];
  const strengths: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

  overview.push(`${contextLabel} contient ${stats.count} transaction(s), avec ${fmtAmount(stats.income)} de revenus, ${fmtAmount(stats.expenses)} de dépenses et un solde de ${fmtAmount(stats.balance)}.`);

  if (topIncome) {
    overview.push(`La principale source de revenus est "${topIncome.label}" avec ${fmtAmount(topIncome.amount)}, soit ${Math.round(topIncome.share * 100)} % des encaissements.`);
  }

  if (topExpense) {
    overview.push(`Le poste de dépense dominant est "${topExpense.label}" avec ${fmtAmount(topExpense.amount)}, soit ${Math.round(topExpense.share * 100)} % des décaissements.`);
  }

  if (payrollSummary) {
    overview.push(`Les salaires et paiements du personnel représentent ${fmtAmount(payrollSummary.amount)}, soit ${Math.round(payrollSummary.share * 100)} % des dépenses de la période.`);
  }

  if (paymentLeader) {
    overview.push(`La caisse la plus contributive est ${paymentLeader.label}, avec un solde net de ${fmtAmount(paymentLeader.balance)}.`);
  }

  if (stats.balance > 0) {
    strengths.push(`La période reste excédentaire avec un solde positif de ${fmtAmount(stats.balance)}.`);
  }

  if (topIncome && topIncome.share < 0.45) {
    strengths.push(`Les revenus sont relativement diversifiés: aucune catégorie ne dépasse 45 % des encaissements.`);
  }

  if (recentTxs.length >= 3) {
    strengths.push(`L'activité est récente et tracée, avec ${recentTxs.length} dernières opérations enregistrées jusqu'au ${new Date(recentTxs[0].date).toLocaleString('fr-FR')}.`);
  }

  if (stats.expenses > stats.income) {
    risks.push(`Les dépenses dépassent les revenus sur la période de ${fmtAmount(stats.expenses - stats.income)}.`);
    actions.push(`Mettre en place une validation renforcée des dépenses et un plafond hebdomadaire tant que le déficit n'est pas résorbé.`);
  }

  if (topExpense && topExpense.share >= 0.5) {
    risks.push(`Une seule catégorie de dépense concentre ${Math.round(topExpense.share * 100)} % des sorties, ce qui crée une forte dépendance budgétaire.`);
    actions.push(`Analyser le poste "${topExpense.label}" pour distinguer les coûts compressibles des coûts fixes et négocier une réduction ciblée.`);
  }

  if (payrollSummary && payrollSummary.share >= 0.3) {
    risks.push(`Les paiements du personnel pèsent lourdement dans la structure de coûts avec ${Math.round(payrollSummary.share * 100)} % des dépenses.`);
    actions.push(`Mettre en place un suivi mensuel dédié des salaires, honoraires et rémunérations pour comparer productivité, charge salariale et rentabilité.`);
  } else if (payrollSummary) {
    strengths.push(`Les paiements du personnel sont identifiés séparément, ce qui améliore le suivi de la masse salariale et des honoraires.`);
  }

  if (topIncome && topIncome.share >= 0.65) {
    risks.push(`Les revenus dépendent fortement de "${topIncome.label}" (${Math.round(topIncome.share * 100)} % des encaissements).`);
    actions.push(`Diversifier les sources de revenus avec au moins une offre complémentaire afin de réduire la dépendance à "${topIncome.label}".`);
  }

  if (paymentLeader) {
    const leaderShare = safeRatio(paymentLeader.income + Math.abs(paymentLeader.expenses), txs.reduce((sum, tx) => sum + tx.amount, 0));
    if (leaderShare >= 0.6) {
      risks.push(`Le flux financier est fortement concentré sur ${paymentLeader.label}.`);
      actions.push(`Mettre en place un rapprochement quotidien spécifique pour ${paymentLeader.label} et encourager une répartition plus équilibrée des encaissements.`);
    }
  }

  if (missingPhoneCount > 0) {
    risks.push(`${missingPhoneCount} transaction(s) de revenu n'ont pas de numéro de contact, ce qui limite les relances et la traçabilité commerciale.`);
    actions.push(`Rendre le numéro systématique pour chaque encaissement client afin d'améliorer les relances, confirmations et analyses commerciales.`);
  }

  if (missingDescriptionCount > 0) {
    risks.push(`${missingDescriptionCount} transaction(s) ont une description vide ou peu exploitable.`);
    actions.push(`Imposer une description plus précise pour chaque opération afin de fiabiliser les audits et les rapports mensuels.`);
  }

  if (stats.count < 5) {
    risks.push(`Le volume de données est encore faible sur cette période, ce qui réduit la fiabilité des tendances.`);
    actions.push(`Poursuivre la saisie systématique des opérations pour disposer d'un historique suffisant avant les arbitrages stratégiques.`);
  }

  if (strengths.length === 0) {
    strengths.push(`Les données sont exploitables pour un pilotage opérationnel et peuvent servir de base à un suivi régulier.`);
  }

  if (risks.length === 0) {
    risks.push(`Aucune dérive majeure n'est détectée sur cette période, mais le suivi doit rester mensuel pour confirmer la tendance.`);
  }

  if (actions.length === 0) {
    actions.push(`Maintenir la cadence actuelle de saisie et générer ce rapport à chaque fin de mois pour comparer l'évolution des indicateurs.`);
  }

  return { overview, strengths, risks, actions };
}

function buildDashboardInsights(txs: Transaction[]): InsightSection {
  const base = buildTransactionInsights(txs, 'Le périmètre global');
  const deptSummaries = departments.map(dept => {
    const deptStats = computeStats(txs.filter(tx => tx.departmentId === dept.id));
    return { name: dept.name, ...deptStats };
  }).filter(item => item.count > 0);

  const bestDept = [...deptSummaries].sort((a, b) => b.balance - a.balance)[0];
  const weakestDept = [...deptSummaries].sort((a, b) => a.balance - b.balance)[0];

  if (bestDept) {
    base.overview.push(`Le département le plus performant est ${bestDept.name}, avec un solde de ${fmtAmount(bestDept.balance)} sur ${bestDept.count} transaction(s).`);
  }

  if (weakestDept && weakestDept.balance < 0) {
    base.risks.push(`${weakestDept.name} est le département le plus fragile avec un solde négatif de ${fmtAmount(weakestDept.balance)}.`);
    base.actions.push(`Mettre en revue le budget de ${weakestDept.name} et définir un plan d'assainissement ciblé sur ses charges principales.`);
  }

  return base;
}

function buildAIReportPayload(reportTitle: string, txs: Transaction[], opts?: ReportOptions): AIReportPayload {
  const summary = computeStats(txs);
  return {
    reportTitle,
    periodLabel: periodLabel(opts),
    summary,
    topIncomeCategories: buildCategoryBreakdown(txs, 'income').slice(0, 5).map(item => ({ label: item.label, amount: item.amount, share: item.share })),
    topExpenseCategories: buildCategoryBreakdown(txs, 'expense').slice(0, 7).map(item => ({ label: item.label, amount: item.amount, share: item.share })),
    strategicExpenses: buildStrategicExpenseBreakdown(txs).slice(0, 7).map(item => ({ label: item.label, amount: item.amount, share: item.share })),
    paymentMethods: getStatsByPaymentMethod(txs).map(item => ({ label: item.label, income: item.income, expenses: item.expenses, balance: item.balance })),
    departmentBalances: departments.map(dept => {
      const deptStats = computeStats(txs.filter(tx => tx.departmentId === dept.id));
      return { label: dept.name, ...deptStats };
    }).filter(item => item.count > 0),
    recentTransactions: [...txs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8)
      .map(tx => ({
        date: tx.date,
        type: tx.type,
        category: tx.category,
        amount: tx.amount,
        department: getDepartment(tx.departmentId).name,
        description: tx.description || "",
      })),
  };
}

async function resolveInsights(reportTitle: string, txs: Transaction[], fallback: InsightSection, opts?: ReportOptions): Promise<InsightSection> {
  if (!shouldUseExternalAI(opts)) return fallback;
  const aiInsights = await generateExternalAIInsights(buildAIReportPayload(reportTitle, txs, opts), opts?.aiProvider);
  if (!aiInsights) return fallback;

  return {
    overview: aiInsights.overview.length > 0 ? aiInsights.overview : fallback.overview,
    strengths: aiInsights.strengths.length > 0 ? aiInsights.strengths : fallback.strengths,
    risks: aiInsights.risks.length > 0 ? aiInsights.risks : fallback.risks,
    actions: aiInsights.actions.length > 0 ? aiInsights.actions : fallback.actions,
  };
}

function ensureSpace(doc: jsPDF, y: number, requiredHeight: number): number {
  if (y + requiredHeight <= 190) return y;
  doc.addPage();
  return 20;
}

function addInsightBlock(doc: jsPDF, title: string, items: string[], y: number): number {
  let nextY = ensureSpace(doc, y, 18);
  nextY = addSectionTitle(doc, title, nextY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  for (const item of items) {
    const wrapped = doc.splitTextToSize(`• ${item}`, 255);
    nextY = ensureSpace(doc, nextY, wrapped.length * 5 + 4);
    doc.text(wrapped, 16, nextY);
    nextY += wrapped.length * 5 + 2;
  }

  return nextY + 3;
}

function addInsightSections(doc: jsPDF, insights: InsightSection, y: number): number {
  let nextY = ensureSpace(doc, y, 20);
  nextY = addSectionTitle(doc, "Analyse intelligente du rapport", nextY);
  nextY += 2;
  nextY = addInsightBlock(doc, "Synthèse exécutive", insights.overview, nextY);
  nextY = addInsightBlock(doc, "Points positifs", insights.strengths, nextY);
  nextY = addInsightBlock(doc, "Points de vigilance", insights.risks, nextY);
  nextY = addInsightBlock(doc, "Améliorations recommandées", insights.actions, nextY);
  return nextY;
}

function addBreakdownTable(
  doc: jsPDF,
  title: string,
  items: CategoryBreakdownItem[],
  y: number,
  headColor: [number, number, number],
): number {
  if (items.length === 0) return y;
  const nextY = addSectionTitle(doc, title, y);
  autoTable(doc, {
    startY: nextY,
    head: [["Poste", "Montant", "% du total", "Nb opérations"]],
    body: items.map(item => [item.label, fmtAmount(item.amount), `${Math.round(item.share * 100)} %`, String(item.count)]),
    theme: "striped",
    headStyles: { fillColor: headColor, fontSize: 8 },
    margin: { left: 14 },
    styles: { fontSize: 8 },
    columnStyles: {
      1: { halign: "right", fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "center" },
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  return (doc as any).lastAutoTable.finalY + 10;
}

// ==================== DASHBOARD REPORT ====================

function computeStats(txs: Transaction[]) {
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expenses, balance: income - expenses, count: txs.length };
}

export async function downloadDashboardReport(opts?: ReportOptions) {
  const reportTitle = "Rapport global — Tableau de bord";
  const doc = await setupDoc(reportTitle, opts);
  const allTxs = filterTransactions(getTransactions(), opts);
  const stats = computeStats(allTxs);
  const txs = allTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const insights = await resolveInsights("Rapport global — Tableau de bord", allTxs, buildDashboardInsights(allTxs), opts);
  const expenseBreakdown = buildCategoryBreakdown(allTxs, 'expense');
  const strategicExpenses = buildStrategicExpenseBreakdown(allTxs);
  let y = 44;

  y = addInsightSections(doc, insights, y);

  // Global stats
  y = addSectionTitle(doc, "Statistiques globales", y);
  autoTable(doc, {
    startY: y,
    head: [["Total revenus", "Total dépenses", "Solde global", "Nb transactions"]],
    body: [[fmtAmount(stats.income), fmtAmount(stats.expenses), fmtAmount(stats.balance), String(stats.count)]],
    theme: "grid",
    headStyles: { fillColor: [34, 87, 122], fontSize: 9 },
    bodyStyles: { fontSize: 10, fontStyle: "bold" },
    margin: { left: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Per-department summary
  y = addSectionTitle(doc, "Résumé par département", y);
  autoTable(doc, {
    startY: y,
    head: [["Département", "Revenus", "Dépenses", "Solde", "Transactions"]],
    body: departments.map(dept => {
      const deptTxs = allTxs.filter(t => t.departmentId === dept.id);
      const s = computeStats(deptTxs);
      return [dept.name, fmtAmount(s.income), fmtAmount(s.expenses), fmtAmount(s.balance), String(s.count)];
    }),
    theme: "grid",
    headStyles: { fillColor: [34, 87, 122], fontSize: 9 },
    margin: { left: 14 },
    styles: { fontSize: 9 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Per payment method
  const payStats = getStatsByPaymentMethod(allTxs);
  if (payStats.length > 0) {
    y = addSectionTitle(doc, "Soldes par caisse", y);
    autoTable(doc, {
      startY: y,
      head: [["Caisse", "Revenus", "Dépenses", "Solde"]],
      body: payStats.map(s => [s.label, fmtAmount(s.income), fmtAmount(s.expenses), fmtAmount(s.balance)]),
      theme: "grid",
      headStyles: { fillColor: [34, 87, 122], fontSize: 9 },
      margin: { left: 14 },
      styles: { fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  y = addBreakdownTable(doc, "Dépenses globales par catégorie", expenseBreakdown, y, [160, 55, 55]);
  y = addBreakdownTable(doc, "Dépenses globales par poste stratégique", strategicExpenses, y, [120, 70, 20]);

  // Full transaction details
  if (txs.length > 0) {
    y = addSectionTitle(doc, `Détail des transactions (${txs.length})`, y);
    autoTable(doc, {
      startY: y,
      head: [["N°", "Date", "Département", "Nom", "Type", "Catégorie", "Description", "Caisse", "Montant"]],
      body: txs.map((tx, i) => {
        const dept = getDepartment(tx.departmentId);
        return [
          String(i + 1),
          new Date(tx.date).toLocaleDateString("fr-FR"),
          dept.name,
          tx.personName || "—",
          tx.type === "income" ? "Revenu" : "Dépense",
          tx.category,
          tx.description || "—",
          getPaymentMethodLabel(tx.paymentMethod || "especes", tx.departmentId),
          tx.type === "income" ? "+" + fmtAmount(tx.amount) : "-" + fmtAmount(tx.amount),
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [34, 87, 122], fontSize: 8 },
      margin: { left: 14 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 12 },
        6: { cellWidth: 55 },
        8: { halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  decoratePages(doc, reportTitle);
  presentPdf(doc, `rapport-global-${new Date().toISOString().slice(0, 10)}.pdf`, opts?.reportMode || "download");
}

// ==================== DEPARTMENT REPORT ====================

export async function downloadDepartmentReport(deptId: DepartmentId, opts?: ReportOptions) {
  const dept = getDepartment(deptId);
  const reportTitle = `Rapport — ${dept.name}`;
  const doc = await setupDoc(reportTitle, opts);
  const allTxs = filterTransactions(getTransactionsByDepartment(deptId), opts);
  const stats = computeStats(allTxs);
  const txs = allTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const insights = await resolveInsights(`Rapport — ${dept.name}`, allTxs, buildTransactionInsights(allTxs, `Le département ${dept.name}`), opts);
  const expenseBreakdown = buildCategoryBreakdown(allTxs, 'expense');
  const strategicExpenses = buildStrategicExpenseBreakdown(allTxs);
  let y = 44;

  y = addInsightSections(doc, insights, y);

  // Department stats
  y = addSectionTitle(doc, `Statistiques — ${dept.name}`, y);
  autoTable(doc, {
    startY: y,
    head: [["Revenus", "Dépenses", "Solde", "Nb transactions"]],
    body: [[fmtAmount(stats.income), fmtAmount(stats.expenses), fmtAmount(stats.balance), String(stats.count)]],
    theme: "grid",
    headStyles: { fillColor: [34, 87, 122], fontSize: 9 },
    bodyStyles: { fontSize: 10, fontStyle: "bold" },
    margin: { left: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Payment method breakdown
  const payStats = getStatsByPaymentMethod(txs);
  if (payStats.length > 0) {
    y = addSectionTitle(doc, "Par caisse", y);
    autoTable(doc, {
      startY: y,
      head: [["Caisse", "Revenus", "Dépenses", "Solde"]],
      body: payStats.map(s => [s.label, fmtAmount(s.income), fmtAmount(s.expenses), fmtAmount(s.balance)]),
      theme: "grid",
      headStyles: { fillColor: [34, 87, 122], fontSize: 9 },
      margin: { left: 14 },
      styles: { fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  y = addBreakdownTable(doc, "Dépenses du département par catégorie", expenseBreakdown, y, [160, 55, 55]);
  y = addBreakdownTable(doc, "Dépenses du département par poste stratégique", strategicExpenses, y, [120, 70, 20]);

  // Full transaction details
  if (txs.length > 0) {
    y = addSectionTitle(doc, `Détail des transactions (${txs.length})`, y);
    autoTable(doc, {
      startY: y,
      head: [["N°", "Date", "Nom", "Type", "Catégorie", "Description", "Caisse", "Montant"]],
      body: txs.map((tx, i) => [
        String(i + 1),
        new Date(tx.date).toLocaleDateString("fr-FR"),
        tx.personName || "—",
        tx.type === "income" ? "Revenu" : "Dépense",
        tx.category,
        tx.description || "—",
        getPaymentMethodLabel(tx.paymentMethod || "especes", tx.departmentId),
        tx.type === "income" ? "+" + fmtAmount(tx.amount) : "-" + fmtAmount(tx.amount),
      ]),
      theme: "striped",
      headStyles: { fillColor: [34, 87, 122], fontSize: 8 },
      margin: { left: 14 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 12 },
        5: { cellWidth: 60 },
        7: { halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  decoratePages(doc, reportTitle);
  presentPdf(doc, `rapport-${deptId}-${new Date().toISOString().slice(0, 10)}.pdf`, opts?.reportMode || "download");
}

// ==================== STOCK REPORT ====================

export async function downloadStockReport(opts?: ReportOptions, departmentId: string = 'gaba') {
  const deptLabel = departmentId === 'gaba' ? 'GABA' : departments.find(d => d.id === departmentId)?.name ?? departmentId;
  const reportTitle = `Rapport de stock — ${deptLabel}`;
  const doc = await setupDoc(reportTitle, opts);
  const stats = getStockStats(departmentId);
  const items = getStockItems(departmentId);
  const allMovements = getStockMovements(departmentId);
  const movements = filterByPeriod(allMovements, opts);
  const trainingsAll = getTrainings(departmentId);
  const trainings = filterByPeriod(trainingsAll, opts);
  let y = 44;

  // Stats
  y = addSectionTitle(doc, "Résumé du stock", y);
  autoTable(doc, {
    startY: y,
    head: [["Articles", "Stock bas", "Valeur totale (vente)", "Mouvements"]],
    body: [[String(stats.totalItems), String(stats.lowStock), fmtAmount(stats.totalValue), String(movements.length)]],
    theme: "grid",
    headStyles: { fillColor: [76, 140, 43], fontSize: 9 },
    bodyStyles: { fontSize: 10, fontStyle: "bold" },
    margin: { left: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Items with purchase/selling prices
  if (items.length > 0) {
    y = addSectionTitle(doc, "Articles en stock", y);
    autoTable(doc, {
      startY: y,
      head: [["Article", "Catégorie", "Qté", "Unité", "Prix achat", "Prix vente", "Valeur stock"]],
      body: items
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
        .map(i => [
          i.name,
          getCategoryLabel(i.categoryId, departmentId),
          String(i.currentQuantity),
          i.unit,
          fmtAmount(i.purchasePrice),
          fmtAmount(i.sellingPrice),
          fmtAmount(i.currentQuantity * i.sellingPrice),
        ]),
      theme: "striped",
      headStyles: { fillColor: [76, 140, 43], fontSize: 8 },
      margin: { left: 14 },
      styles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 250, 240] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Training summary
  if (trainings.length > 0) {
    y = addSectionTitle(doc, `Formations (${trainings.length})`, y);
    autoTable(doc, {
      startY: y,
      head: [["Date", "Type", "Parc/Lieu", "Tranche", "Inscrit le", "Formés", "Kits", "Matériels", "Offerts"]],
      body: trainings
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(t => {
          const kitsInfo = (t.traineeKits ?? []).map(k => {
            const parts: string[] = [];
            if (k.starterKitHannetons > 0) parts.push(`${k.starterKitHannetons}h`);
            if (k.hasBook) parts.push('livre');
            return parts.length > 0 ? `${k.traineeName}(${parts.join(',')})` : '';
          }).filter(Boolean).join(', ') || '—';
          return [
            new Date(t.date).toLocaleDateString("fr-FR"),
            t.trainingType === 'guims-academy' ? 'Academy' : 'GABA',
            t.parkName,
            t.tranche || '—',
            t.enrollmentDate ? new Date(t.enrollmentDate).toLocaleDateString("fr-FR") : '—',
            t.trainees.join(", "),
            kitsInfo,
            t.materialsUsed.map(m => { const it = items.find(i => i.id === m.itemId); return `${it?.name ?? '?'} ×${m.quantity}`; }).join(", ") || "—",
            t.giftsGiven.map(g => { const it = items.find(i => i.id === g.itemId); return `${it?.name ?? '?'} ×${g.quantity} → ${g.traineeName}`; }).join(", ") || "—",
          ];
        }),
      theme: "striped",
      headStyles: { fillColor: [180, 130, 30], fontSize: 7 },
      margin: { left: 14 },
      styles: { fontSize: 7 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Movements
  const recentMvs = [...movements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 100);
  if (recentMvs.length > 0) {
    y = addSectionTitle(doc, `Mouvements (${recentMvs.length}${movements.length > 100 ? ' sur ' + movements.length : ''})`, y);
    autoTable(doc, {
      startY: y,
      head: [["Date", "Article", "Type", "Motif", "Parc/Formé", "Qté", "Avant", "Après", "Prix", "Par"]],
      body: recentMvs.map(mv => {
        const item = items.find(i => i.id === mv.itemId);
        const extra = [mv.parkName, mv.traineeName].filter(Boolean).join(" → ");
        return [
          new Date(mv.date).toLocaleDateString("fr-FR"),
          item?.name ?? "—",
          getMovementTypeLabel(mv.type),
          mv.reason,
          extra || "—",
          String(mv.quantity),
          String(mv.previousQuantity),
          String(mv.newQuantity),
          mv.unitPrice > 0 ? fmtAmount(mv.unitPrice) : "—",
          mv.createdBy,
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [76, 140, 43], fontSize: 7 },
      margin: { left: 14 },
      styles: { fontSize: 7 },
    });
  }

  decoratePages(doc, reportTitle);
  presentPdf(doc, `rapport-stock-${departmentId}-${new Date().toISOString().slice(0, 10)}.pdf`, opts?.reportMode || "download");
}

// ==================== FULL TRANSACTIONS REPORT ====================

export async function downloadTransactionsReport(opts?: ReportOptions) {
  const reportTitle = "Rapport de toutes les transactions";
  const doc = await setupDoc(reportTitle, opts);
  const txs = filterTransactions(getTransactions(), opts).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const insights = await resolveInsights("Rapport de toutes les transactions", txs, buildTransactionInsights(txs, 'Le rapport des transactions'), opts);
  const expenseBreakdown = buildCategoryBreakdown(txs, 'expense');
  const strategicExpenses = buildStrategicExpenseBreakdown(txs);
  let y = 44;

  y = addInsightSections(doc, insights, y);

  y = addBreakdownTable(doc, "Dépenses par catégorie", expenseBreakdown, y, [160, 55, 55]);
  y = addBreakdownTable(doc, "Dépenses par poste stratégique", strategicExpenses, y, [120, 70, 20]);

  y = addSectionTitle(doc, `Total : ${txs.length} transactions`, y);

  if (txs.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["N°", "Date/Heure", "Département", "Nom", "Téléphone", "Type", "Catégorie", "Description", "Caisse", "Montant"]],
      body: txs.map((tx, i) => {
        const dept = getDepartment(tx.departmentId);
        return [
          String(i + 1),
          new Date(tx.date).toLocaleString("fr-FR"),
          dept.name,
          tx.personName || "—",
          tx.phoneNumber || "—",
          tx.type === "income" ? "Revenu" : "Dépense",
          tx.category,
          tx.description || "—",
          getPaymentMethodLabel(tx.paymentMethod || "especes", tx.departmentId),
          tx.type === "income" ? "+" + fmtAmount(tx.amount) : "-" + fmtAmount(tx.amount),
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [34, 87, 122], fontSize: 8 },
      margin: { left: 14 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 34 },
        7: { cellWidth: 48 },
        9: { halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  decoratePages(doc, reportTitle);
  presentPdf(doc, `rapport-transactions-${new Date().toISOString().slice(0, 10)}.pdf`, opts?.reportMode || "download");
}

// ==================== AUDIT LOG REPORT ====================

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
};

export async function downloadAuditReport(opts?: ReportOptions) {
  const reportTitle = "Journal d'audit";
  const doc = await setupDoc(reportTitle, opts);
  const log = getAuditLog().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  let y = 44;

  y = addSectionTitle(doc, `Total : ${log.length} entrées`, y);

  if (log.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Date", "Utilisateur", "Action", "Détails", "Justification"]],
      body: log.map(e => {
        const readableDetails = e.action === 'update' && e.previousData && e.newData
          ? buildHumanDiff(e.previousData, e.newData)
          : e.details;
        return [
          new Date(e.timestamp).toLocaleString("fr-FR"),
          e.username,
          AUDIT_ACTION_LABELS[e.action] || e.action,
          readableDetails || e.details,
          e.justification || "—",
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [34, 87, 122], fontSize: 8 },
      margin: { left: 14 },
      styles: { fontSize: 7, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 30 },
        2: { cellWidth: 26 },
        3: { cellWidth: 120 },
        4: { cellWidth: 55 },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  decoratePages(doc, reportTitle);
  presentPdf(doc, `rapport-audit-${new Date().toISOString().slice(0, 10)}.pdf`, opts?.reportMode || "download");
}
