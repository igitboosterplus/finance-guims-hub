import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAllUsers, approveUser, rejectUser, deleteUser, createUser, resetUserPassword, updateUserPermissions, getUserPermissions, type User, type UserRole, type UserPermissions, DEFAULT_PERMISSIONS } from "@/lib/auth";
import { departments, STOCK_ENABLED_DEPARTMENT_IDS } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { UserPlus, Check, X, Trash2, KeyRound, Shield, ShieldCheck, Settings2, Building2, Plus, PenLine, Download, Upload, Package } from "lucide-react";

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [permsUser, setPermsUser] = useState<User | null>(null);
  const [permsEdit, setPermsEdit] = useState<UserPermissions>(DEFAULT_PERMISSIONS);

  // Create form
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("admin");

  const refresh = () => setUsers(getAllUsers());

  useEffect(() => { refresh(); }, []);

  if (!currentUser || currentUser.role !== 'superadmin') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg">Accès réservé au Super Admin</p>
      </div>
    );
  }

  const pendingUsers = users.filter(u => !u.approved);
  const approvedUsers = users.filter(u => u.approved);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createUser(newUsername, newPwd, newDisplayName, newRole);
    if (result.success) {
      toast.success("Compte créé et approuvé");
      setShowCreate(false);
      setNewUsername(""); setNewDisplayName(""); setNewPwd(""); setNewRole("admin");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleApprove = (id: string) => {
    approveUser(id);
    toast.success("Compte approuvé");
    refresh();
  };

  const handleReject = (id: string) => {
    rejectUser(id);
    toast.success("Compte refusé et supprimé");
    refresh();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteUser(deleteId);
    setDeleteId(null);
    toast.success("Compte supprimé");
    refresh();
  };

  const handleResetPassword = async () => {
    if (!resetId || newPassword.length < 6) {
      toast.error("Min. 6 caractères");
      return;
    }
    await resetUserPassword(resetId, newPassword);
    setResetId(null);
    setNewPassword("");
    toast.success("Mot de passe réinitialisé");
  };

  const openPerms = (u: User) => {
    setPermsUser(u);
    setPermsEdit({ ...getUserPermissions(u) });
  };

  const toggleDept = (deptId: string) => {
    setPermsEdit(prev => ({
      ...prev,
      departments: prev.departments.includes(deptId)
        ? prev.departments.filter(d => d !== deptId)
        : [...prev.departments, deptId],
    }));
  };

  const toggleStockDept = (deptId: string) => {
    setPermsEdit(prev => ({
      ...prev,
      stockDepartments: (prev.stockDepartments ?? []).includes(deptId)
        ? (prev.stockDepartments ?? []).filter(d => d !== deptId)
        : [...(prev.stockDepartments ?? []), deptId],
    }));
  };

  const handleSavePerms = () => {
    if (!permsUser) return;
    const result = updateUserPermissions(permsUser.id, permsEdit);
    if (result.success) {
      toast.success(`Droits de ${permsUser.displayName} mis à jour`);
      setPermsUser(null);
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const getPermsCount = (u: User) => {
    const p = getUserPermissions(u);
    let count = 0;
    if (p.canCreateTransaction) count++;
    if (p.canEditTransaction) count++;
    if (p.canExportData) count++;
    if (p.canImportData) count++;
    return { count, depts: p.departments.length };
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gestion des utilisateurs</h2>
          <p className="text-sm text-muted-foreground">Gérer les comptes admin et leurs permissions</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Nouveau compte
        </Button>
      </div>

      {/* Pending approvals */}
      {pendingUsers.length > 0 && (
        <Card className="border-warning/30 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                {pendingUsers.length}
              </Badge>
              Comptes en attente d'approbation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm">{u.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{u.username} — créé le {new Date(u.createdAt).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1 text-success border-success/30" onClick={() => handleApprove(u.id)}>
                      <Check className="h-3 w-3" /> Approuver
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30" onClick={() => handleReject(u.id)}>
                      <X className="h-3 w-3" /> Refuser
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All users */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Comptes actifs ({approvedUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Droits d'accès</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="w-36"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedUsers.map(u => {
                const pc = getPermsCount(u);
                return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.displayName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">@{u.username}</TableCell>
                  <TableCell>
                    {u.role === 'superadmin' ? (
                      <Badge className="bg-primary/10 text-primary border-primary/30" variant="outline">
                        <ShieldCheck className="h-3 w-3 mr-1" /> Super Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Shield className="h-3 w-3 mr-1" /> Admin
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.role === 'superadmin' ? (
                      <span className="text-xs text-muted-foreground">Tous les droits</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {pc.depts} dép. · {pc.count} action{pc.count > 1 ? 's' : ''}
                        </span>
                        {pc.depts === 0 && pc.count === 0 && (
                          <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/5">
                            Aucun droit
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                  </TableCell>
                  <TableCell>
                    {u.id !== currentUser.id && (
                      <div className="flex gap-1">
                        {u.role !== 'superadmin' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => openPerms(u)} title="Gérer les droits">
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setResetId(u.id)} title="Réinitialiser mot de passe">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(u.id)} title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau compte</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="Jean Dupont" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom d'utilisateur</Label>
                <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="jdupont" />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 car." />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={newRole} onValueChange={v => setNewRole(v as UserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="superadmin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button type="submit">Créer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetId} onOpenChange={open => !open && setResetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 caractères" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetId(null)}>Annuler</Button>
            <Button onClick={handleResetPassword}>Réinitialiser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions dialog */}
      <Dialog open={!!permsUser} onOpenChange={open => !open && setPermsUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Droits d'accès — {permsUser?.displayName}
            </DialogTitle>
            <DialogDescription>
              Définissez les départements et actions autorisés pour ce compte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* Departments */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4" /> Départements accessibles
              </Label>
              <div className="grid grid-cols-1 gap-2">
                {departments.map(dept => (
                  <label key={dept.id} className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                    <Checkbox
                      checked={permsEdit.departments.includes(dept.id)}
                      onCheckedChange={() => toggleDept(dept.id)}
                    />
                    <img src={dept.logo} alt={dept.name} className="h-6 w-6 rounded-md object-cover" />
                    <span className="text-sm font-medium">{dept.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setPermsEdit(p => ({ ...p, departments: departments.map(d => d.id) }))}>
                  Tout sélectionner
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setPermsEdit(p => ({ ...p, departments: [] }))}>
                  Tout désélectionner
                </Button>
              </div>
            </div>

            {/* Stock Departments */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4" /> Accès aux stocks
              </Label>
              <p className="text-[11px] text-muted-foreground">Indépendant de l'accès au département. Une personne peut voir un département sans accéder à son stock.</p>
              <div className="grid grid-cols-1 gap-2">
                {departments.filter(dept => STOCK_ENABLED_DEPARTMENT_IDS.includes(dept.id)).map(dept => (
                  <label key={dept.id} className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                    <Checkbox
                      checked={(permsEdit.stockDepartments ?? []).includes(dept.id)}
                      onCheckedChange={() => toggleStockDept(dept.id)}
                    />
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Stock {dept.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setPermsEdit(p => ({ ...p, stockDepartments: STOCK_ENABLED_DEPARTMENT_IDS }))}>
                  Tout sélectionner
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setPermsEdit(p => ({ ...p, stockDepartments: [] }))}>
                  Tout désélectionner
                </Button>
              </div>
            </div>

            {/* Action permissions */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Actions autorisées</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-success" />
                    <div>
                      <p className="text-sm font-medium">Créer des transactions</p>
                      <p className="text-[11px] text-muted-foreground">Ajouter de nouvelles entrées/sorties</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canCreateTransaction} onCheckedChange={v => setPermsEdit(p => ({ ...p, canCreateTransaction: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-warning" />
                    <div>
                      <p className="text-sm font-medium">Modifier des transactions</p>
                      <p className="text-[11px] text-muted-foreground">Éditer les transactions existantes</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canEditTransaction} onCheckedChange={v => setPermsEdit(p => ({ ...p, canEditTransaction: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Exporter les données</p>
                      <p className="text-[11px] text-muted-foreground">Télécharger en CSV ou sauvegarder en JSON</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canExportData} onCheckedChange={v => setPermsEdit(p => ({ ...p, canExportData: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">Restaurer les données</p>
                      <p className="text-[11px] text-muted-foreground">Importer une sauvegarde JSON (écrase les données)</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canImportData} onCheckedChange={v => setPermsEdit(p => ({ ...p, canImportData: v }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsUser(null)}>Annuler</Button>
            <Button onClick={handleSavePerms} className="gap-2">
              <Check className="h-4 w-4" /> Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
