import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  departments, getTransactions, getGlobalStats, getDepartmentStats,
  getTransactionsByDepartment, getDepartment, formatCurrency,
  getPaymentMethodLabel, getStatsByPaymentMethod, type DepartmentId,
} from "./data";
import { getStockItems, getStockMovements, getCategoryLabel, getStockStats } from "./stock";

// ==================== HELPERS ====================

function setupDoc(title: string): jsPDF {
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Guims Group — Finance Hub", 14, 20);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(title, 14, 28);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`, 14, 35);
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
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

// ==================== DASHBOARD REPORT ====================

export function downloadDashboardReport() {
  const doc = setupDoc("Rapport global — Tableau de bord");
  const stats = getGlobalStats();
  let y = 45;

  // Global stats table
  y = addSectionTitle(doc, "Statistiques globales", y);
  autoTable(doc, {
    startY: y,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Total revenus", fmtAmount(stats.income)],
      ["Total dépenses", fmtAmount(stats.expenses)],
      ["Solde global", fmtAmount(stats.balance)],
      ["Nombre de transactions", String(stats.count)],
    ],
    theme: "grid",
    headStyles: { fillColor: [34, 87, 122] },
    margin: { left: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Per-department stats
  y = addSectionTitle(doc, "Résumé par département", y);
  const deptRows = departments.map(dept => {
    const s = getDepartmentStats(dept.id);
    return [dept.name, fmtAmount(s.income), fmtAmount(s.expenses), fmtAmount(s.balance), String(s.count)];
  });
  autoTable(doc, {
    startY: y,
    head: [["Département", "Revenus", "Dépenses", "Solde", "Transactions"]],
    body: deptRows,
    theme: "grid",
    headStyles: { fillColor: [34, 87, 122] },
    margin: { left: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Per payment method
  const payStats = getStatsByPaymentMethod();
  if (payStats.length > 0) {
    y = addSectionTitle(doc, "Soldes par caisse", y);
    autoTable(doc, {
      startY: y,
      head: [["Caisse", "Revenus", "Dépenses", "Solde"]],
      body: payStats.map(s => [s.label, fmtAmount(s.income), fmtAmount(s.expenses), fmtAmount(s.balance)]),
      theme: "grid",
      headStyles: { fillColor: [34, 87, 122] },
      margin: { left: 14 },
    });
  }

  doc.save(`rapport-global-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== DEPARTMENT REPORT ====================

export function downloadDepartmentReport(deptId: DepartmentId) {
  const dept = getDepartment(deptId);
  const doc = setupDoc(`Rapport — ${dept.name}`);
  const stats = getDepartmentStats(deptId);
  const txs = getTransactionsByDepartment(deptId);
  let y = 45;

  // Department stats
  y = addSectionTitle(doc, `Statistiques — ${dept.name}`, y);
  autoTable(doc, {
    startY: y,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Revenus", fmtAmount(stats.income)],
      ["Dépenses", fmtAmount(stats.expenses)],
      ["Solde", fmtAmount(stats.balance)],
      ["Transactions", String(stats.count)],
    ],
    theme: "grid",
    headStyles: { fillColor: [34, 87, 122] },
    margin: { left: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Payment method breakdown
  const payStats = getStatsByPaymentMethod(txs);
  if (payStats.length > 0) {
    y = addSectionTitle(doc, "Par caisse", y);
    autoTable(doc, {
      startY: y,
      head: [["Caisse", "Revenus", "Dépenses", "Solde"]],
      body: payStats.map(s => [s.label, fmtAmount(s.income), fmtAmount(s.expenses), fmtAmount(s.balance)]),
      theme: "grid",
      headStyles: { fillColor: [34, 87, 122] },
      margin: { left: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Transaction list
  if (txs.length > 0) {
    y = addSectionTitle(doc, "Liste des transactions", y);
    const txRows = txs
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(tx => [
        new Date(tx.date).toLocaleDateString("fr-FR"),
        tx.type === "income" ? "Revenu" : "Dépense",
        getPaymentMethodLabel(tx.paymentMethod || "especes"),
        tx.category,
        tx.description.slice(0, 40),
        tx.type === "income" ? fmtAmount(tx.amount) : "-" + fmtAmount(tx.amount),
      ]);
    autoTable(doc, {
      startY: y,
      head: [["Date", "Type", "Caisse", "Catégorie", "Description", "Montant"]],
      body: txRows,
      theme: "striped",
      headStyles: { fillColor: [34, 87, 122] },
      margin: { left: 14 },
      styles: { fontSize: 8 },
    });
  }

  doc.save(`rapport-${deptId}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== GABA STOCK REPORT ====================

export function downloadStockReport() {
  const doc = setupDoc("Rapport de stock — GABA");
  const stats = getStockStats();
  const items = getStockItems();
  const movements = getStockMovements();
  let y = 45;

  // Stats
  y = addSectionTitle(doc, "Résumé du stock", y);
  autoTable(doc, {
    startY: y,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Articles en stock", String(stats.totalItems)],
      ["Alertes stock bas", String(stats.lowStock)],
      ["Valeur totale", fmtAmount(stats.totalValue)],
      ["Mouvements enregistrés", String(stats.totalMovements)],
    ],
    theme: "grid",
    headStyles: { fillColor: [76, 140, 43] },
    margin: { left: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Items
  if (items.length > 0) {
    y = addSectionTitle(doc, "Articles", y);
    autoTable(doc, {
      startY: y,
      head: [["Article", "Catégorie", "Quantité", "Unité", "Prix unit.", "Valeur"]],
      body: items
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
        .map(i => [
          i.name,
          getCategoryLabel(i.categoryId),
          String(i.currentQuantity),
          i.unit,
          fmtAmount(i.unitPrice),
          fmtAmount(i.currentQuantity * i.unitPrice),
        ]),
      theme: "striped",
      headStyles: { fillColor: [76, 140, 43] },
      margin: { left: 14 },
      styles: { fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Last 50 movements
  const recentMvs = [...movements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 50);
  if (recentMvs.length > 0) {
    y = addSectionTitle(doc, "Derniers mouvements (50 max)", y);
    autoTable(doc, {
      startY: y,
      head: [["Date", "Article", "Type", "Motif", "Qté", "Avant", "Après", "Par"]],
      body: recentMvs.map(mv => {
        const item = items.find(i => i.id === mv.itemId);
        return [
          new Date(mv.date).toLocaleDateString("fr-FR"),
          item?.name ?? "—",
          mv.type === "entry" ? "Entrée" : mv.type === "exit" ? "Sortie" : "Ajust.",
          mv.reason,
          String(mv.quantity),
          String(mv.previousQuantity),
          String(mv.newQuantity),
          mv.createdBy,
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [76, 140, 43] },
      margin: { left: 14 },
      styles: { fontSize: 8 },
    });
  }

  doc.save(`rapport-stock-gaba-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==================== FULL TRANSACTIONS REPORT ====================

export function downloadTransactionsReport() {
  const doc = setupDoc("Rapport de toutes les transactions");
  const txs = getTransactions().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let y = 45;

  y = addSectionTitle(doc, `Total : ${txs.length} transactions`, y);

  if (txs.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Date", "Département", "Type", "Caisse", "Catégorie", "Description", "Montant"]],
      body: txs.map(tx => {
        const dept = getDepartment(tx.departmentId);
        return [
          new Date(tx.date).toLocaleDateString("fr-FR"),
          dept.name,
          tx.type === "income" ? "Revenu" : "Dépense",
          getPaymentMethodLabel(tx.paymentMethod || "especes"),
          tx.category,
          tx.description.slice(0, 35),
          tx.type === "income" ? fmtAmount(tx.amount) : "-" + fmtAmount(tx.amount),
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [34, 87, 122] },
      margin: { left: 14 },
      styles: { fontSize: 7 },
    });
  }

  doc.save(`rapport-transactions-${new Date().toISOString().slice(0, 10)}.pdf`);
}
