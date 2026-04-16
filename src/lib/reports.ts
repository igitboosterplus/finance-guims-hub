import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  departments, getTransactions, getGlobalStats, getDepartmentStats,
  getTransactionsByDepartment, getDepartment, formatCurrency,
  getPaymentMethodLabel, getStatsByPaymentMethod, type DepartmentId, type Transaction,
} from "./data";
import { getStockItems, getStockMovements, getCategoryLabel, getStockStats, getTrainings, getMovementTypeLabel } from "./stock";
import { getAuditLog, buildHumanDiff } from "./auth";

// ==================== HELPERS ====================

export interface ReportOptions {
  startDate?: string;
  endDate?: string;
  personName?: string;
}

function filterByPeriod<T extends { date: string }>(items: T[], opts?: ReportOptions): T[] {
  let result = items;
  if (opts?.startDate) result = result.filter(i => i.date >= opts.startDate!);
  if (opts?.endDate) result = result.filter(i => i.date <= opts.endDate!);
  return result;
}

function filterTransactions(txs: Transaction[], opts?: ReportOptions): Transaction[] {
  let result = filterByPeriod(txs, opts);
  if (opts?.personName) {
    const name = opts.personName.toLowerCase();
    result = result.filter(t => (t.personName || '').toLowerCase().includes(name));
  }
  return result;
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

function setupDoc(title: string, opts?: ReportOptions): jsPDF {
  const doc = new jsPDF({ orientation: "landscape" });
  // En-tête
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(34, 87, 122);
  doc.text("Guims Group — Finance Hub", 14, 18);
  doc.setDrawColor(34, 87, 122);
  doc.setLineWidth(0.5);
  doc.line(14, 22, 283, 22);
  // Sous-titre
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(title, 14, 30);
  doc.setFontSize(9);
  const dateInfo = `Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`;
  const pLabel = opts?.startDate || opts?.endDate ? ` · Période : ${periodLabel(opts)}` : '';
  doc.text(dateInfo + pLabel, 14, 36);
  doc.setTextColor(0);
  return doc;
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

// ==================== DASHBOARD REPORT ====================

function computeStats(txs: Transaction[]) {
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expenses, balance: income - expenses, count: txs.length };
}

export function downloadDashboardReport(opts?: ReportOptions) {
  const doc = setupDoc("Rapport global — Tableau de bord", opts);
  const allTxs = filterTransactions(getTransactions(), opts);
  const stats = computeStats(allTxs);
  const txs = allTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let y = 44;

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
          getPaymentMethodLabel(tx.paymentMethod || "especes"),
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

  doc.save(`rapport-global-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== DEPARTMENT REPORT ====================

export function downloadDepartmentReport(deptId: DepartmentId, opts?: ReportOptions) {
  const dept = getDepartment(deptId);
  const doc = setupDoc(`Rapport — ${dept.name}`, opts);
  const allTxs = filterTransactions(getTransactionsByDepartment(deptId), opts);
  const stats = computeStats(allTxs);
  const txs = allTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let y = 44;

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
        getPaymentMethodLabel(tx.paymentMethod || "especes"),
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

  doc.save(`rapport-${deptId}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== STOCK REPORT ====================

export function downloadStockReport(opts?: ReportOptions, departmentId: string = 'gaba') {
  const deptLabel = departmentId === 'gaba' ? 'GABA' : departments.find(d => d.id === departmentId)?.name ?? departmentId;
  const doc = setupDoc(`Rapport de stock — ${deptLabel}`, opts);
  const stats = getStockStats(departmentId);
  const items = getStockItems(departmentId);
  const allMovements = getStockMovements(departmentId);
  const movements = filterByPeriod(allMovements, opts);
  const trainingsAll = getTrainings(departmentId);
  const trainings = opts?.startDate || opts?.endDate
    ? trainingsAll.filter(t => (!opts.startDate || t.date >= opts.startDate) && (!opts.endDate || t.date <= opts.endDate))
    : trainingsAll;
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

  doc.save(`rapport-stock-${departmentId}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== FULL TRANSACTIONS REPORT ====================

export function downloadTransactionsReport(opts?: ReportOptions) {
  const doc = setupDoc("Rapport de toutes les transactions", opts);
  const txs = filterTransactions(getTransactions(), opts).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let y = 44;

  y = addSectionTitle(doc, `Total : ${txs.length} transactions`, y);

  if (txs.length > 0) {
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
          getPaymentMethodLabel(tx.paymentMethod || "especes"),
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

  doc.save(`rapport-transactions-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== AUDIT LOG REPORT ====================

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
};

export function downloadAuditReport() {
  const doc = setupDoc("Journal d'audit");
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

  doc.save(`rapport-audit-${new Date().toISOString().slice(0, 10)}.pdf`);
}
