import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditLog, markAuditEntriesSeen, buildHumanDiff, deleteAuditEntry, type AuditLogEntry } from "@/lib/auth";
import { downloadAuditReport } from "@/lib/reports";
import { useAuth } from "@/hooks/useAuth";
import { Download, Search, FileText, PenLine, Trash2, Plus, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 20;

const actionIcons: Record<string, typeof Plus> = {
  create: Plus,
  update: PenLine,
  delete: Trash2,
};

const actionLabels: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
};

const actionColors: Record<string, string> = {
  create: 'bg-success/10 text-success border-success/30',
  update: 'bg-warning/10 text-warning border-warning/30',
  delete: 'bg-destructive/10 text-destructive border-destructive/30',
};

export default function AuditLogPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const log = getAuditLog();
    setEntries(log);
    if (user?.role === 'superadmin') {
      markAuditEntriesSeen();
    }
  }, [user]);

  if (!user || user.role !== 'superadmin') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg">Accès réservé au Super Admin</p>
      </div>
    );
  }

  const filtered = entries
    .filter(e => {
      const q = search.toLowerCase();
      return !q ||
        e.username.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q) ||
        actionLabels[e.action]?.toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleExport = async () => {
    await downloadAuditReport();
    toast.success("Rapport d'audit généré");
  };

  const handleDelete = (entryId: string) => {
    if (!user) return;
    const success = deleteAuditEntry(entryId, { userId: user.id, username: user.username });
    if (success) {
      setEntries(getAuditLog());
      toast.success("Entrée d'audit supprimée");
    } else {
      toast.error("Erreur lors de la suppression");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            Journal d'audit
          </h2>
          <p className="text-sm text-muted-foreground">{entries.length} entrée{entries.length > 1 ? 's' : ''} enregistrée{entries.length > 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2 self-start sm:self-auto">
          <Download className="h-4 w-4" />
          Rapport PDF
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher dans le journal..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Aucune entrée dans le journal</p>
        </div>
      ) : (
        <>
          <Card className="border-0 shadow-md overflow-x-auto">
            <CardContent className="p-0">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead>Justification</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(entry => {
                    const Icon = actionIcons[entry.action] || FileText;
                    const readableDetails = entry.action === 'update' && entry.previousData && entry.newData
                      ? buildHumanDiff(entry.previousData, entry.newData)
                      : entry.details;
                    return (
                      <TableRow key={entry.id} className={!entry.seen ? 'bg-primary/5' : ''}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{entry.username}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={actionColors[entry.action]}>
                            <Icon className="h-3 w-3 mr-1" />
                            {actionLabels[entry.action]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[350px]">
                          <span className="whitespace-pre-wrap break-words">{readableDetails || entry.details}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                          {entry.justification ? (
                            <span className="italic">{entry.justification}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer cette entrée ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Cette action sera enregistrée dans le Super Audit. L'entrée sera définitivement supprimée du journal.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(entry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {filtered.length} entrée{filtered.length > 1 ? 's' : ''} — Page {currentPage}/{totalPages}
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
    </div>
  );
}
