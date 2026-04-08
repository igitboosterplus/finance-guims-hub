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
import { Trash2, ArrowUpRight, ArrowDownRight, Search, Pencil, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { formatCurrency, type Transaction, type PaymentMethod, getDepartment, deleteTransaction, updateTransaction, departments, exportTransactionsCSV, PAYMENT_METHODS, getPaymentMethodLabel } from "@/lib/data";
import { addAuditEntry, getCurrentUser, isSuperAdmin, hasPermission, buildHumanDiff } from "@/lib/auth";
import { syncInstallmentFromTransaction, removeInstallmentFromTransaction, syncEditedTransaction } from "@/lib/stock";
import { toast } from "sonner";

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
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  // Edit form state
  const [editCategory, setEditCategory] = useState("");
  const [editPersonName, setEditPersonName] = useState("");
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
        tx.description.toLowerCase().includes(q) ||
        getDepartment(tx.departmentId).name.toLowerCase().includes(q) ||
        getPaymentMethodLabel(tx.paymentMethod || 'especes').toLowerCase().includes(q) ||
        tx.amount.toString().includes(q);
      const matchType = typeFilter === "all" || tx.type === typeFilter;
      const matchCategory = categoryFilter === "all" || tx.category === categoryFilter;
      return matchSearch && matchType && matchCategory;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleDelete = () => {
    if (!deleteId) return;
    const currentUser = getCurrentUser();
    if (!currentUser || !isSuperAdmin(currentUser)) {
      toast.error("Seul le Super Admin peut supprimer des transactions");
      setDeleteId(null);
      return;
    }
    const txToDelete = transactions.find(t => t.id === deleteId);
    deleteTransaction(deleteId);
    // Remove corresponding installment from payment plan (or reset inscription)
    if (txToDelete?.personName) {
      removeInstallmentFromTransaction(txToDelete.personName, txToDelete.date, txToDelete.amount, txToDelete.category);
    }
    if (txToDelete && currentUser) {
      addAuditEntry({
        userId: currentUser.id,
        username: currentUser.username,
        action: 'delete',
        entityType: 'transaction',
        entityId: deleteId,
        details: `Suppression: ${txToDelete.category} - ${txToDelete.description}`,
        previousData: JSON.stringify({ type: txToDelete.type, amount: txToDelete.amount, category: txToDelete.category, date: txToDelete.date, paymentMethod: txToDelete.paymentMethod }),
        newData: '',
      });
    }
    setDeleteId(null);
    toast.success("Transaction supprimée");
    onDelete?.();
  };

  const openEdit = (tx: Transaction) => {
    setEditTx(tx);
    setEditCategory(tx.category);
    setEditPersonName(tx.personName || '');
    setEditDescription(tx.description);
    setEditAmount(String(tx.amount));
    setEditDate(tx.date);
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
    const previousData = JSON.stringify({ type: editTx.type, amount: editTx.amount, category: editTx.category, personName: editTx.personName, date: editTx.date, paymentMethod: editTx.paymentMethod, description: editTx.description });
    updateTransaction(editTx.id, {
      category: editCategory,
      personName: editPersonName.trim(),
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
    const newData = JSON.stringify({ type: editType, amount: parsedAmount, category: editCategory, personName: editPersonName, date: editDate, paymentMethod: editPaymentMethod, description: editDescription });
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

  const editDept = editTx ? getDepartment(editTx.departmentId) : null;
  const editCategories = editDept
    ? editType === "income" ? editDept.incomeCategories : editDept.expenseCategories
    : [];

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
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
            {[...new Set(transactions.map(tx => tx.category))].sort().map(cat => (
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
        {hasPermission(getCurrentUser(), 'canExportData') && (
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            CSV
          </Button>
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
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Caisse</TableHead>
                  {showDepartment && <TableHead>Département</TableHead>}
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Description</TableHead>
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
                        {new Date(tx.date).toLocaleDateString('fr-FR')}
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
                          {getPaymentMethodLabel(tx.paymentMethod || 'especes')}
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
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{tx.description}</TableCell>
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
                          {isSuperAdmin(getCurrentUser()) && (
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
                    {PAYMENT_METHODS.map((m) => (
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
                    {editCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
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
