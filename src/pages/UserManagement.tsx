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
import { getAllUsers, approveUser, rejectUser, deleteUser, createUser, resetUserPassword, updateUserPermissions, getUserPermissions, hasPermission, type User, type UserRole, type UserPermissions, DEFAULT_PERMISSIONS } from "@/lib/auth";
import { canDeletePaymentMethod, createPaymentMethod, deletePaymentMethod, departments, getAllPaymentMethods, STOCK_ENABLED_DEPARTMENT_IDS, type DepartmentId, type PaymentMethodOption } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { UserPlus, Users, Check, X, Trash2, KeyRound, Shield, ShieldCheck, Settings2, Building2, Plus, PenLine, Download, Upload, Package, LineChart, Sparkles, CreditCard, GraduationCap, FileText, RotateCcw } from "lucide-react";

type ActionPermissionKey = keyof Omit<UserPermissions, 'departments' | 'stockDepartments'>;

const ACTION_PERMISSION_KEYS: ActionPermissionKey[] = [
  'canCreateTransaction',
  'canEditTransaction',
  'canDeleteTransaction',
  'canRecordStockExitWithoutPrice',
  'canAccessFormations',
  'canAccessPaymentTracking',
  'canAccessAIAccountingChat',
  'canExportData',
  'canImportData',
  'canManageUsers',
  'canViewAudit',
  'canRestoreAuditEntries',
  'canViewBalanceDelta',
  'canViewSuperAudit',
];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletePaymentMethodId, setDeletePaymentMethodId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [permsUser, setPermsUser] = useState<User | null>(null);
  const [permsEdit, setPermsEdit] = useState<UserPermissions>(DEFAULT_PERMISSIONS);

  // Create form
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("admin");
  const [newPaymentMethodLabel, setNewPaymentMethodLabel] = useState("");
  const [newPaymentMethodDepartments, setNewPaymentMethodDepartments] = useState<DepartmentId[]>([]);

  const refresh = () => {
    setUsers(getAllUsers());
    setPaymentMethods(getAllPaymentMethods());
  };

  useEffect(() => { refresh(); }, []);

  if (!currentUser || !hasPermission(currentUser, 'canManageUsers')) {
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
    const result = rejectUser(id);
    if (result.success) {
      toast.success("Compte refusé et supprimé");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const result = deleteUser(deleteId);
    setDeleteId(null);
    if (result.success) {
      toast.success("Compte supprimé");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const togglePaymentMethodDept = (deptId: DepartmentId) => {
    setNewPaymentMethodDepartments(prev => (
      prev.includes(deptId)
        ? prev.filter(id => id !== deptId)
        : [...prev, deptId]
    ));
  };

  const handleCreatePaymentMethod = () => {
    const result = createPaymentMethod(newPaymentMethodLabel, newPaymentMethodDepartments);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Caisse ${result.method?.label} créée`);
    setNewPaymentMethodLabel("");
    setNewPaymentMethodDepartments([]);
    refresh();
  };

  const handleDeletePaymentMethod = () => {
    if (!deletePaymentMethodId) return;
    const result = deletePaymentMethod(deletePaymentMethodId);
    setDeletePaymentMethodId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Caisse supprimée");
    refresh();
  };

  const handleResetPassword = async () => {
    if (!resetId || newPassword.length < 8) {
      toast.error("Min. 8 caractères");
      return;
    }
    const result = await resetUserPassword(resetId, newPassword);
    if (!result.success) {
      toast.error(result.error || "Échec de la réinitialisation du mot de passe");
      return;
    }
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

  const buildActionsState = (enabled: boolean) => {
    return ACTION_PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = enabled;
      return acc;
    }, {} as Record<ActionPermissionKey, boolean>);
  };

  const applyActionPreset = (preset: "minimal" | "operator" | "auditor" | "manager" | "admin-delegue" | "full") => {
    const allOff = buildActionsState(false);
    let patch: Partial<Record<ActionPermissionKey, boolean>> = {};

    if (preset === "minimal") {
      patch = {
        canCreateTransaction: true,
      };
    }

    if (preset === "operator") {
      patch = {
        canCreateTransaction: true,
        canEditTransaction: true,
        canAccessFormations: true,
        canAccessPaymentTracking: true,
        canAccessAIAccountingChat: true,
      };
    }

    if (preset === "auditor") {
      patch = {
        canViewAudit: true,
        canViewBalanceDelta: true,
        canExportData: true,
      };
    }

    if (preset === "manager") {
      patch = {
        canCreateTransaction: true,
        canEditTransaction: true,
        canDeleteTransaction: true,
        canAccessFormations: true,
        canAccessPaymentTracking: true,
        canAccessAIAccountingChat: true,
        canExportData: true,
        canImportData: true,
        canViewAudit: true,
        canRestoreAuditEntries: true,
        canViewBalanceDelta: true,
      };
    }

    if (preset === "admin-delegue") {
      patch = {
        ...buildActionsState(true),
        canViewSuperAudit: false,
      };
    }

    if (preset === "full") {
      patch = {
        ...buildActionsState(true),
      };
    }

    setPermsEdit(prev => ({
      ...prev,
      ...allOff,
      ...patch,
    }));
  };

  const getPermsCount = (u: User) => {
    const p = getUserPermissions(u);
    const count = ACTION_PERMISSION_KEYS.filter((k) => Boolean(p[k])).length;
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

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Gestion des caisses ({paymentMethods.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">Le Super Admin peut créer et supprimer toute caisse non utilisée, sauf les caisses de base requises.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border p-4 space-y-4">
            <div className="space-y-2">
              <Label>Nom de la nouvelle caisse</Label>
              <Input value={newPaymentMethodLabel} onChange={e => setNewPaymentMethodLabel(e.target.value)} placeholder="Ex: Caisse terrain Bafoussam" />
            </div>
            <div className="space-y-3">
              <Label>Départements concernés</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {departments.map(dept => (
                  <label key={dept.id} className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                    <Checkbox
                      checked={newPaymentMethodDepartments.includes(dept.id)}
                      onCheckedChange={() => togglePaymentMethodDept(dept.id)}
                    />
                    <span className="text-sm font-medium">{dept.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setNewPaymentMethodDepartments(departments.map(dept => dept.id))}>
                  Tous les départements
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setNewPaymentMethodDepartments([])}>
                  Effacer
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" className="gap-2" onClick={handleCreatePaymentMethod}>
                <Plus className="h-4 w-4" />
                Créer la caisse
              </Button>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caisse</TableHead>
                  <TableHead>Départements</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentMethods.map(method => (
                  <TableRow key={method.value}>
                    <TableCell className="font-medium">{method.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {method.departmentIds.length > 0
                        ? method.departmentIds.map(deptId => departments.find(dept => dept.id === deptId)?.name ?? deptId).join(', ')
                        : 'Historique non affecté'}
                    </TableCell>
                    <TableCell>
                      {method.system ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">Système</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Personnalisée</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canDeletePaymentMethod(method.value) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletePaymentMethodId(method.value)} title="Supprimer la caisse">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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

      <AlertDialog open={!!deletePaymentMethodId} onOpenChange={open => !open && setDeletePaymentMethodId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette caisse ?</AlertDialogTitle>
            <AlertDialogDescription>La suppression est refusée si cette caisse est déjà utilisée dans des transactions ou des paiements enregistrés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePaymentMethod} className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
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
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 caractères" />
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
              <div className="rounded-lg border p-2.5 space-y-2">
                <p className="text-[11px] text-muted-foreground">Profils rapides</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => applyActionPreset("minimal")}>Minimal</Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => applyActionPreset("operator")}>Opérateur</Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => applyActionPreset("auditor")}>Auditeur</Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => applyActionPreset("manager")}>Manager</Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => applyActionPreset("admin-delegue")}>Admin délégué</Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => applyActionPreset("full")}>Tout autoriser</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setPermsEdit(p => ({ ...p, ...buildActionsState(true) }))}>Activer toutes les actions</Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setPermsEdit(p => ({ ...p, ...buildActionsState(false) }))}>Désactiver toutes les actions</Button>
                </div>
              </div>
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
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">Supprimer des transactions</p>
                      <p className="text-[11px] text-muted-foreground">Autoriser la suppression définitive d'une transaction</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canDeleteTransaction} onCheckedChange={v => setPermsEdit(p => ({ ...p, canDeleteTransaction: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium">Sorties stock sans prix</p>
                      <p className="text-[11px] text-muted-foreground">Autoriser utilisation, perte, don et autres sorties non commerciales</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canRecordStockExitWithoutPrice} onCheckedChange={v => setPermsEdit(p => ({ ...p, canRecordStockExitWithoutPrice: v }))} />
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
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Gérer les utilisateurs</p>
                      <p className="text-[11px] text-muted-foreground">Créer, approuver, modifier les droits et supprimer des comptes</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canManageUsers} onCheckedChange={v => setPermsEdit(p => ({ ...p, canManageUsers: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <LineChart className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Voir l'écart de solde</p>
                      <p className="text-[11px] text-muted-foreground">Accéder à la page Ecart de solde (date/période)</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canViewBalanceDelta} onCheckedChange={v => setPermsEdit(p => ({ ...p, canViewBalanceDelta: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Accéder à Formations</p>
                      <p className="text-[11px] text-muted-foreground">Ouvrir la page Formations</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canAccessFormations} onCheckedChange={v => setPermsEdit(p => ({ ...p, canAccessFormations: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Accéder à Suivi paiements</p>
                      <p className="text-[11px] text-muted-foreground">Ouvrir la page des plans et relances</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canAccessPaymentTracking} onCheckedChange={v => setPermsEdit(p => ({ ...p, canAccessPaymentTracking: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Accéder au Chat IA compta</p>
                      <p className="text-[11px] text-muted-foreground">Utiliser l'assistant IA comptable</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canAccessAIAccountingChat} onCheckedChange={v => setPermsEdit(p => ({ ...p, canAccessAIAccountingChat: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Voir le journal d'audit</p>
                      <p className="text-[11px] text-muted-foreground">Accéder à la page Audit</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canViewAudit} onCheckedChange={v => setPermsEdit(p => ({ ...p, canViewAudit: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Restaurer depuis l'audit</p>
                      <p className="text-[11px] text-muted-foreground">Autoriser le bouton Restaurer dans l'audit</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canRestoreAuditEntries} onCheckedChange={v => setPermsEdit(p => ({ ...p, canRestoreAuditEntries: v }))} />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Voir le Super Audit</p>
                      <p className="text-[11px] text-muted-foreground">Accéder au journal de sécurité avancé</p>
                    </div>
                  </div>
                  <Switch checked={permsEdit.canViewSuperAudit} onCheckedChange={v => setPermsEdit(p => ({ ...p, canViewSuperAudit: v }))} />
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
