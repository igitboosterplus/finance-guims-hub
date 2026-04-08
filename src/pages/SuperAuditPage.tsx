import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSuperAuditLog, type SuperAuditEntry } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { Search, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

const actionLabels: Record<string, string> = {
  create_transaction: 'Création transaction',
  update_transaction: 'Modification transaction',
  delete_transaction: 'Suppression transaction',
  delete_audit: 'Suppression audit',
  create_user: 'Création utilisateur',
  delete_user: 'Suppression utilisateur',
  approve_user: 'Approbation utilisateur',
  reject_user: 'Rejet utilisateur',
  reset_password: 'Réinitialisation MDP',
  update_permissions: 'Mise à jour permissions',
  login: 'Connexion',
  logout: 'Déconnexion',
  other: 'Autre',
};

const actionColors: Record<string, string> = {
  create_transaction: 'bg-success/10 text-success border-success/30',
  update_transaction: 'bg-warning/10 text-warning border-warning/30',
  delete_transaction: 'bg-destructive/10 text-destructive border-destructive/30',
  delete_audit: 'bg-destructive/10 text-destructive border-destructive/30',
  create_user: 'bg-success/10 text-success border-success/30',
  delete_user: 'bg-destructive/10 text-destructive border-destructive/30',
  approve_user: 'bg-success/10 text-success border-success/30',
  reject_user: 'bg-warning/10 text-warning border-warning/30',
  reset_password: 'bg-warning/10 text-warning border-warning/30',
  update_permissions: 'bg-warning/10 text-warning border-warning/30',
  login: 'bg-primary/10 text-primary border-primary/30',
  logout: 'bg-primary/10 text-primary border-primary/30',
  other: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

export default function SuperAuditPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<SuperAuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setEntries(getSuperAuditLog());
  }, []);

  if (!user || user.role !== 'superadmin') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ShieldCheck className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg">Accès réservé à l'Admin Principal</p>
      </div>
    );
  }

  const filtered = entries
    .filter(e => {
      const q = search.toLowerCase();
      return !q ||
        e.username.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q) ||
        (actionLabels[e.action] ?? e.action).toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          Super Audit
        </h2>
        <p className="text-sm text-muted-foreground">
          {entries.length} action{entries.length > 1 ? 's' : ''} enregistrée{entries.length > 1 ? 's' : ''} — visible uniquement par l'admin principal
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher dans le super audit..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Aucune action enregistrée</p>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{entry.username}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={actionColors[entry.action] ?? actionColors.other}>
                          {actionLabels[entry.action] ?? entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[450px]">
                        <span className="whitespace-pre-wrap break-words">{entry.details}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {filtered.length} action{filtered.length > 1 ? 's' : ''} — Page {currentPage}/{totalPages}
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
