import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, ArrowUpRight, ArrowDownRight, Search, Pencil, ChevronLeft, ChevronRight, Download, FileDown } from "lucide-react";
import { formatCurrency, type Transaction, type PaymentMethod, getDepartment, deleteTransaction, updateTransaction, exportTransactionsCSV, getPaymentMethodsForDepartment, getPaymentMethodLabel, getTransactions, isInscriptionCategory } from "@/lib/data";
import { addAuditEntry, getCurrentUser, hasPermission, buildHumanDiff } from "@/lib/auth";
import { syncInstallmentFromTransaction, removeInstallmentFromTransaction, syncEditedTransaction } from "@/lib/stock";
import { getTransactionTimestamp, transactionDateToInputValue } from "@/lib/transactionDates";
import { findEmployeeByName } from "@/lib/employees";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TransactionListProps {
  transactions: Transaction[];
  onDelete?: () => void;
  showDepartment?: boolean;
}

const PAGE_SIZE = 15;

export function TransactionList({ transactions, onDelete, showDepartment = false }: TransactionListProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [doubleConfirmOpen, setDoubleConfirmOpen] = useState(false);
  const [doubleConfirmText, setDoubleConfirmText] = useState("");
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  // Edit form state
  const [editCategory, setEditCategory] = useState("");
  const [editPersonName, setEditPersonName] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState<'income' | 'expense'>('income');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('especes');
  const [editJustification, setEditJustification] = useState("");

  const filtered = [...transactions]
    .filter((tx) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        tx.category.toLowerCase().includes(q) ||
        (tx.personName || '').toLowerCase().includes(q) ||
        (tx.phoneNumber || '').toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        (tx.saleTicketNumber || '').toLowerCase().includes(q) ||
        getDepartment(tx.departmentId).name.toLowerCase().includes(q) ||
        getPaymentMethodLabel(tx.paymentMethod || 'especes', tx.departmentId).toLowerCase().includes(q) ||
        tx.amount.toString().includes(q);
      const matchType = typeFilter === "all" || tx.type === typeFilter;
      const matchCategory = categoryFilter === "all" || tx.category === categoryFilter;
      
      // Date range filter
      let matchDate = true;
      if (dateFrom || dateTo) {
        const txDate = new Date(getTransactionTimestamp(tx.date)).toISOString().split('T')[0];
        if (dateFrom && txDate < dateFrom) matchDate = false;
        if (dateTo && txDate > dateTo) matchDate = false;
      }
      
      return matchSearch && matchType && matchCategory && matchDate;
    })
    .sort((a, b) => getTransactionTimestamp(b.date) - getTransactionTimestamp(a.date));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const txToDelete = deleteId ? transactions.find(t => t.id === deleteId) : null;
  const isInscriptionLinkedTransaction = (tx: Transaction) => {
    const category = tx.category || "";
    const description = (tx.description || "").toLowerCase();
    return isInscriptionCategory(category) || category.toLowerCase().includes("inscription") || description.includes("inscription");
  };

  const finalizeDelete = (targetId: string) => {
    const currentUser = getCurrentUser();
    if (!hasPermission(currentUser, 'canDeleteTransaction')) {
      toast.error("Vous n'avez pas le droit de supprimer des transactions");
      setDeleteId(null);
      setDoubleConfirmOpen(false);
      setDoubleConfirmText("");
      return;
    }
    const tx = transactions.find(t => t.id === targetId);
    deleteTransaction(targetId);
    // Remove corresponding installment from payment plan (or reset inscription)
    if (tx?.personName) {
      removeInstallmentFromTransaction(tx.personName, tx.date, tx.amount, tx.category);
    }
    if (tx && currentUser) {
      addAuditEntry({
        userId: currentUser.id,
        username: currentUser.username,
        action: 'delete',
        entityType: 'transaction',
        entityId: targetId,
        details: `Suppression: ${tx.category} - ${tx.description}`,
        previousData: JSON.stringify({
          departmentId: tx.departmentId,
          type: tx.type,
          paymentMethod: tx.paymentMethod,
          category: tx.category,
          personName: tx.personName,
          phoneNumber: tx.phoneNumber,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          enrollmentDate: tx.enrollmentDate,
          tranche: tx.tranche,
          formationName: tx.formationName,
          desiredTrainingDate: tx.desiredTrainingDate,
          formationKit: tx.formationKit,
        }),
        newData: '',
      });
    }
    setDeleteId(null);
    setDoubleConfirmOpen(false);
    setDoubleConfirmText("");
    toast.success("Transaction supprimée");
    onDelete?.();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const tx = transactions.find(t => t.id === deleteId);
    if (!tx) return;

    if (isInscriptionLinkedTransaction(tx)) {
      setDoubleConfirmText("");
      setDoubleConfirmOpen(true);
      return;
    }

    finalizeDelete(deleteId);
  };

  const confirmDoubleDelete = () => {
    if (!deleteId) return;
    if (doubleConfirmText.trim().toUpperCase() !== "SUPPRIMER") {
      toast.error('Tapez "SUPPRIMER" pour confirmer');
      return;
    }
    finalizeDelete(deleteId);
  };

  const openEdit = (tx: Transaction) => {
    setEditTx(tx);
    setEditCategory(tx.category);
    setEditPersonName(tx.personName || '');
    setEditPhoneNumber(tx.phoneNumber || '');
    setEditDescription(tx.description);
    setEditAmount(String(tx.amount));
    setEditDate(transactionDateToInputValue(tx.date));
    setEditType(tx.type);
    setEditPaymentMethod(tx.paymentMethod || 'especes');
    setEditJustification("");
  };

  const handleEdit = () => {
    if (!editTx) return;
    const currentUser = getCurrentUser();
    if (!hasPermission(currentUser, 'canEditTransaction')) {
      toast.error("Vous n'avez pas le droit de modifier les transactions");
      setEditTx(null);
      return;
    }
    const parsedAmount = parseInt(editAmount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Montant invalide");
      return;
    }
    if (!editJustification.trim()) {
      toast.error("Veuillez saisir la justification de la modification");
      return;
    }

    const becomesEmployeePayment =
      editTx.departmentId === 'charges-entreprise' &&
      editType === 'expense' &&
      editCategory === 'Paiement employés';

    if (becomesEmployeePayment) {
      const employee = findEmployeeByName('charges-entreprise', editPersonName);
      if (!employee) {
        toast.error("Employé introuvable. Ajoutez d'abord cet employé dans la liste avec son salaire mensuel.");
        return;
      }

      if (!employee.monthlySalary || employee.monthlySalary <= 0) {
        toast.error("Salaire mensuel non défini pour cet employé. Définissez-le avant ce retrait salarial.");
        return;
      }

      const editedDate = new Date(editDate || editTx.date);
      const year = editedDate.getFullYear();
      const month = editedDate.getMonth();
      const normalizedName = employee.fullName.trim().toLowerCase();

      const paidThisMonthExcludingEdited = getTransactions()
        .filter((tx) => tx.id !== editTx.id)
        .filter((tx) =>
          tx.departmentId === 'charges-entreprise' &&
          tx.type === 'expense' &&
          tx.category === 'Paiement employés' &&
          tx.personName.trim().toLowerCase() === normalizedName,
        )
        .filter((tx) => {
          const d = new Date(tx.date);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((sum, tx) => sum + tx.amount, 0);

      const projectedPaid = paidThisMonthExcludingEdited + parsedAmount;
      if (projectedPaid > employee.monthlySalary) {
        const over = projectedPaid - employee.monthlySalary;
        toast.error(`Modification refusée: dépassement de ${formatCurrency(over)} sur le salaire mensuel (${formatCurrency(employee.monthlySalary)}).`);
        return;
      }
    }

    const previousData = JSON.stringify({ type: editTx.type, amount: editTx.amount, category: editTx.category, personName: editTx.personName, phoneNumber: editTx.phoneNumber, date: editTx.date, paymentMethod: editTx.paymentMethod, description: editTx.description });
    updateTransaction(editTx.id, {
      category: editCategory,
      personName: editPersonName.trim(),
      phoneNumber: editPhoneNumber.trim() || undefined,
      description: editDescription,
      amount: parsedAmount,
      date: editDate,
      type: editType,
      paymentMethod: editPaymentMethod,
    });
    // Sync changes to payment plan (handles amount change, category change inscription ↔ tranche)
    if (editTx.personName && (editTx.amount !== parsedAmount || editTx.category !== editCategory)) {
      syncEditedTransaction(editTx.personName, editTx.date, editTx.amount, parsedAmount, editTx.category, editCategory);
    }
    const newData = JSON.stringify({ type: editType, amount: parsedAmount, category: editCategory, personName: editPersonName, phoneNumber: editPhoneNumber.trim() || undefined, date: editDate, paymentMethod: editPaymentMethod, description: editDescription });
    const readableDetails = buildHumanDiff(previousData, newData);
    if (currentUser) {
      addAuditEntry({
        userId: currentUser.id,
        username: currentUser.username,
        action: 'update',
        entityType: 'transaction',
        entityId: editTx.id,
        details: readableDetails || `Modification: ${editTx.category} → ${editCategory}`,
        previousData,
        newData,
        justification: editJustification.trim(),
      });
    }
    setEditTx(null);
    toast.success("Transaction modifiée");
    onDelete?.();
  };

  const handleExportCSV = () => {
    const csv = exportTransactionsCSV();
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV téléchargé");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(34, 87, 122);
    doc.text("Guims Group — Transactions", 14, 18);
    doc.setDrawColor(34, 87, 122);
    doc.setLineWidth(0.5);
    doc.line(14, 22, 283, 22);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")} · ${filtered.length} transaction(s)`, 14, 28);
    doc.setTextColor(0);

    const fmtAmt = (n: number) => {
      const abs = Math.abs(Math.round(n));
      return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " FCFA";
    };

    const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    autoTable(doc, {
      startY: 34,
      head: [["Total revenus", "Total dépenses", "Solde"]],
      body: [[fmtAmt(income), fmtAmt(expenses), fmtAmt(income - expenses)]],
      theme: "grid",
      headStyles: { fillColor: [34, 87, 122], fontSize: 9 },
      bodyStyles: { fontSize: 10, fontStyle: "bold" },
      margin: { left: 14 },
    });

    let y = (doc as any).lastAutoTable.finalY + 8;

    if (filtered.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["N°", "Date/Heure", "Département", "Nom", "Téléphone", "Type", "Catégorie", "Description", "Caisse", "Montant"]],
        body: filtered.map((tx, i) => {
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
            tx.type === "income" ? "+" + fmtAmt(tx.amount) : "-" + fmtAmt(tx.amount),
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

    doc.save(`transactions_${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Export PDF téléchargé");
  };

  const editDept = editTx ? getDepartment(editTx.departmentId) : null;
  const editCategories = editDept
    ? editType === "income" ? editDept.incomeCategories : editDept.expenseCategories
    : [];
  const safeCategoryOptions = [...new Set(transactions.map(tx => (tx.category || '').trim()))]
    .filter(Boolean)
    .sort();
  const safeEditCategories = editCategories.map(c => (c || '').trim()).filter(Boolean);
  const editPaymentMethods = getPaymentMethodsForDepartment(editTx?.departmentId);

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par catégorie, description, département..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Toutes catégories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {safeCategoryOptions.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="income">Revenus</SelectItem>
            <SelectItem value="expense">Dépenses</SelectItem>
          </SelectContent>
        </Select>
        </div>
        {/* Date range filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label htmlFor="dateFrom" className="text-xs text-muted-foreground block mb-1">De</Label>
            <Input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="text-sm"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="dateTo" className="text-xs text-muted-foreground block mb-1">À</Label>
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="text-sm"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
              className="self-end"
            >
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        {hasPermission(getCurrentUser(), 'canExportData') && (
          <>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
            <FileDown className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            CSV
          </Button>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Aucune transaction</p>
          <p className="text-sm">{search ? "Essayez une autre recherche" : "Les transactions apparaîtront ici"}</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Heure</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Caisse</TableHead>
                  {showDepartment && <TableHead>Département</TableHead>}
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Détails</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((tx) => {
                  const dept = getDepartment(tx.departmentId);
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">
                        {new Date(tx.date).toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell>
                        {tx.type === 'income' ? (
                          <Badge variant="outline" className="border-success/30 text-success bg-success/5">
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                            Entrée
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5">
                            <ArrowDownRight className="h-3 w-3 mr-1" />
                            Sortie
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {getPaymentMethodLabel(tx.paymentMethod || 'especes', tx.departmentId)}
                        </Badge>
                      </TableCell>
                      {showDepartment && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${dept.bgClass}`} />
                            <span className="text-sm">{dept.name}</span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-sm font-medium">{tx.personName || '—'}</TableCell>
                      <TableCell className="text-sm">{tx.category}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[260px]">
                        <div className="space-y-1">
                          <p className="truncate">{tx.description || '—'}</p>
                          <p className="text-xs">Numéro: {tx.phoneNumber || '—'}</p>
                          {tx.saleTicketNumber && <p className="text-xs">Ticket vente: {tx.saleTicketNumber}</p>}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${tx.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {hasPermission(getCurrentUser(), 'canEditTransaction') && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(tx)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {hasPermission(getCurrentUser(), 'canDeleteTransaction') && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(tx.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {filtered.length} transaction{filtered.length > 1 ? 's' : ''} — Page {currentPage}/{totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette transaction ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La transaction sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={doubleConfirmOpen} onOpenChange={(open) => { setDoubleConfirmOpen(open); if (!open) setDoubleConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verrou actif: transaction d'inscription</AlertDialogTitle>
            <AlertDialogDescription>
              Cette transaction est liee a une inscription et peut impacter fortement le solde.
              Pour confirmer la suppression, tapez SUPPRIMER ci-dessous.
              {txToDelete && (
                <span className="block mt-2 text-foreground font-medium">
                  {txToDelete.personName || 'Sans nom'} - {txToDelete.category} - {formatCurrency(txToDelete.amount)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="double-delete-confirm">Confirmation</Label>
            <Input
              id="double-delete-confirm"
              placeholder='Tapez SUPPRIMER'
              value={doubleConfirmText}
              onChange={(e) => setDoubleConfirmText(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDoubleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmer suppression
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      <Dialog open={!!editTx} onOpenChange={(open) => !open && setEditTx(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={editType} onValueChange={(v) => { setEditType(v as 'income' | 'expense'); setEditCategory(''); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Revenu</SelectItem>
                    <SelectItem value="expense">Dépense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Caisse</Label>
                <Select value={editPaymentMethod} onValueChange={(v) => setEditPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {editPaymentMethods.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {safeEditCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="text" value={new Date(editDate).toLocaleString('fr-FR')} readOnly disabled />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Montant (FCFA)</Label>
                <Input type="number" step="1" min="1" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nom de la personne</Label>
                <Input placeholder="Nom..." value={editPersonName} onChange={(e) => setEditPersonName(e.target.value)} maxLength={100} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Numéro de téléphone</Label>
              <Input
                placeholder="Ex: 6 99 00 00 00"
                value={editPhoneNumber}
                onChange={(e) => setEditPhoneNumber(e.target.value)}
                maxLength={30}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={500} />
            </div>
            <div className="space-y-2">
              <Label>Justification de la modification *</Label>
              <Textarea
                placeholder="Raison de la modification (obligatoire)..."
                value={editJustification}
                onChange={(e) => setEditJustification(e.target.value)}
                maxLength={300}
                className="border-warning/50 focus-visible:ring-warning"
              />
              <p className="text-xs text-muted-foreground">Cette justification sera enregistrée dans le journal d'audit.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>Annuler</Button>
            <Button onClick={handleEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
