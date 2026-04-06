import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  departments, getTransactions, getGlobalStats, getDepartmentStats,
  getTransactionsByDepartment, getDepartment, formatCurrency,
  getPaymentMethodLabel, getStatsByPaymentMethod, type DepartmentId, type Transaction,
} from "./data";
import { getStockItems, getStockMovements, getCategoryLabel, getStockStats, getTrainings, getMovementTypeLabel } from "./stock";

// ==================== HELPERS ====================

export interface ReportOptions {
  startDate?: string;
  endDate?: string;
}

function filterByPeriod<T extends { date: string }>(items: T[], opts?: ReportOptions): T[] {
  let result = items;
  if (opts?.startDate) result = result.filter(i => i.date >= opts.startDate!);
  if (opts?.endDate) result = result.filter(i => i.date <= opts.endDate!);
  return result;
}

function periodLabel(opts?: ReportOptions): string {
  if (opts?.startDate && opts?.endDate) return `Du ${new Date(opts.startDate).toLocaleDateString("fr-FR")} au ${new Date(opts.endDate).toLocaleDateString("fr-FR")}`;
  if (opts?.startDate) return `À partir du ${new Date(opts.startDate).toLocaleDateString("fr-FR")}`;
  if (opts?.endDate) return `Jusqu'au ${new Date(opts.endDate).toLocaleDateString("fr-FR")}`;
  return "Toutes les dates";
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
  const allTxs = filterByPeriod(getTransactions(), opts);
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
      head: [["N°", "Date", "Département", "Type", "Catégorie", "Motif / Description", "Caisse", "Montant"]],
      body: txs.map((tx, i) => {
        const dept = getDepartment(tx.departmentId);
        return [
          String(i + 1),
          new Date(tx.date).toLocaleDateString("fr-FR"),
          dept.name,
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
        5: { cellWidth: 65 },
        7: { halign: "right", fontStyle: "bold" },
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
  const allTxs = filterByPeriod(getTransactionsByDepartment(deptId), opts);
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
      head: [["N°", "Date", "Type", "Catégorie", "Motif / Description", "Caisse", "Montant"]],
      body: txs.map((tx, i) => [
        String(i + 1),
        new Date(tx.date).toLocaleDateString("fr-FR"),
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
        4: { cellWidth: 70 },
        6: { halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  doc.save(`rapport-${deptId}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== GABA STOCK REPORT ====================

export function downloadStockReport(opts?: ReportOptions) {
  const doc = setupDoc("Rapport de stock — GABA", opts);
  const stats = getStockStats();
  const items = getStockItems();
  const allMovements = getStockMovements();
  const movements = filterByPeriod(allMovements, opts);
  const trainingsAll = getTrainings();
  const trainings = opts?.startDate || opts?.endDate
    ? trainingsAll.filter(t => (!opts.startDate || t.date >= opts.startDate) && (!opts.endDate || t.date <= opts.endDate))
    : trainingsAll;
  let y = 44;

  // Stats
  y = addSectionTitle(doc, "Résumé du stock", y);
  autoTable(doc, {
    startY: y,
    head: [["Articles", "Stock bas", "Valeur totale (achat)", "Mouvements"]],
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
          getCategoryLabel(i.categoryId),
          String(i.currentQuantity),
          i.unit,
          fmtAmount(i.purchasePrice),
          fmtAmount(i.sellingPrice),
          fmtAmount(i.currentQuantity * i.purchasePrice),
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
      head: [["Date", "Parc", "Formés", "Matériels utilisés", "Éléments offerts"]],
      body: trainings
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(t => [
          new Date(t.date).toLocaleDateString("fr-FR"),
          t.parkName,
          t.trainees.join(", "),
          t.materialsUsed.map(m => { const it = items.find(i => i.id === m.itemId); return `${it?.name ?? '?'} ×${m.quantity}`; }).join(", ") || "—",
          t.giftsGiven.map(g => { const it = items.find(i => i.id === g.itemId); return `${it?.name ?? '?'} ×${g.quantity} → ${g.traineeName}`; }).join(", ") || "—",
        ]),
      theme: "striped",
      headStyles: { fillColor: [180, 130, 30], fontSize: 8 },
      margin: { left: 14 },
      styles: { fontSize: 8 },
      columnStyles: { 2: { cellWidth: 50 }, 3: { cellWidth: 55 }, 4: { cellWidth: 55 } },
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

  doc.save(`rapport-stock-gaba-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== FULL TRANSACTIONS REPORT ====================

export function downloadTransactionsReport(opts?: ReportOptions) {
  const doc = setupDoc("Rapport de toutes les transactions", opts);
  const txs = filterByPeriod(getTransactions(), opts).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let y = 44;

  y = addSectionTitle(doc, `Total : ${txs.length} transactions`, y);

  if (txs.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["N°", "Date", "Département", "Type", "Catégorie", "Motif / Description", "Caisse", "Montant"]],
      body: txs.map((tx, i) => {
        const dept = getDepartment(tx.departmentId);
        return [
          String(i + 1),
          new Date(tx.date).toLocaleDateString("fr-FR"),
          dept.name,
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
        5: { cellWidth: 60 },
        7: { halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  doc.save(`rapport-transactions-${new Date().toISOString().slice(0, 10)}.pdf`);
}
