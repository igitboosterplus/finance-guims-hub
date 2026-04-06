import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditLog, markAuditEntriesSeen, exportAuditReportCSV, type AuditLogEntry } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { Download, Search, FileText, PenLine, Trash2, Plus, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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

  const handleExport = () => {
    const csv = exportAuditReportCSV();
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-audit_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Rapport d'audit téléchargé");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Journal d'audit
          </h2>
          <p className="text-sm text-muted-foreground">{entries.length} entrée{entries.length > 1 ? 's' : ''} enregistrée{entries.length > 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Exporter le rapport
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
          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead>Avant</TableHead>
                    <TableHead>Après</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(entry => {
                    const Icon = actionIcons[entry.action] || FileText;
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
                        <TableCell className="text-sm max-w-[250px] truncate">{entry.details}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                          {entry.previousData || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                          {entry.newData || '—'}
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
