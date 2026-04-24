import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { departments, formatCurrency, getDepartment, type DepartmentId } from "@/lib/data";
import { addEmployee, deleteEmployee, getEmployeeLastPaymentDate, getEmployeesByDepartment, updateEmployee, type Employee } from "@/lib/employees";
import { Users, UserPlus, Pencil, Trash2, Phone, BriefcaseBusiness, WalletCards, CalendarClock, Building2 } from "lucide-react";
import { toast } from "sonner";

interface EmployeeDirectoryProps {
  departmentId: DepartmentId;
}

const EMPTY_FORM = {
  fullName: "",
  workDepartmentIds: ["charges-entreprise" as DepartmentId],
  rolesText: "",
  phoneNumber: "",
  monthlySalary: "",
  hireDate: "",
  notes: "",
  status: "actif" as 'actif' | 'inactif',
};

export function EmployeeDirectory({ departmentId }: EmployeeDirectoryProps) {
  const [employees, setEmployees] = useState(() => getEmployeesByDepartment(departmentId));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const refresh = () => setEmployees(getEmployeesByDepartment(departmentId));

  const activeCount = useMemo(() => employees.filter(item => item.status === 'actif').length, [employees]);
  const monthlyPayroll = useMemo(() => employees.filter(item => item.status === 'actif').reduce((sum, item) => sum + (item.monthlySalary || 0), 0), [employees]);

  const openCreate = () => {
    setEditingEmployee(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      fullName: employee.fullName,
      workDepartmentIds: employee.workDepartmentIds,
      rolesText: employee.roles.join(", "),
      phoneNumber: employee.phoneNumber || "",
      monthlySalary: employee.monthlySalary ? String(employee.monthlySalary) : "",
      hireDate: employee.hireDate || "",
      notes: employee.notes || "",
      status: employee.status,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const parsedRoles = form.rolesText.split(",").map(item => item.trim()).filter(Boolean);
    if (!form.fullName.trim() || parsedRoles.length === 0) {
      toast.error("Nom et au moins une fonction sont obligatoires");
      return;
    }
    if (form.workDepartmentIds.length === 0) {
      toast.error("Sélectionnez au moins un département de travail");
      return;
    }

    const monthlySalary = form.monthlySalary ? parseInt(form.monthlySalary, 10) : undefined;
    if (form.monthlySalary && (!monthlySalary || monthlySalary < 0)) {
      toast.error("Salaire mensuel invalide");
      return;
    }

    if (editingEmployee) {
      updateEmployee(editingEmployee.id, {
        fullName: form.fullName,
        workDepartmentIds: form.workDepartmentIds,
        roles: parsedRoles,
        phoneNumber: form.phoneNumber,
        monthlySalary,
        hireDate: form.hireDate,
        notes: form.notes,
        status: form.status,
      });
      toast.success("Employé mis à jour");
    } else {
      addEmployee({
        departmentId,
        workDepartmentIds: form.workDepartmentIds,
        fullName: form.fullName,
        roles: parsedRoles,
        phoneNumber: form.phoneNumber,
        monthlySalary,
        hireDate: form.hireDate,
        notes: form.notes,
        status: form.status,
      });
      toast.success("Employé ajouté");
    }

    setDialogOpen(false);
    setEditingEmployee(null);
    setForm(EMPTY_FORM);
    refresh();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteEmployee(deleteId);
    setDeleteId(null);
    refresh();
    toast.success("Employé supprimé");
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Liste des employés
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Référence interne pour suivre le personnel, les contacts et la masse salariale.</p>
        </div>
        <Button onClick={openCreate} className="gap-2 w-full sm:w-auto">
          <UserPlus className="h-4 w-4" />
          Ajouter un employé
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border p-4 bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Employés enregistrés</p>
            <p className="mt-2 text-2xl font-bold">{employees.length}</p>
          </div>
          <div className="rounded-xl border p-4 bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Employés actifs</p>
            <p className="mt-2 text-2xl font-bold">{activeCount}</p>
          </div>
          <div className="rounded-xl border p-4 bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Masse salariale mensuelle</p>
            <p className="mt-2 text-2xl font-bold">{formatCurrency(monthlyPayroll)}</p>
          </div>
        </div>

        {employees.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Aucun employé enregistré pour ce département.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {employees.map(employee => (
              <div key={employee.id} className="rounded-xl border p-4 bg-card space-y-3">
                {(() => {
                  const workDepartments = employee.workDepartmentIds.map(id => getDepartment(id).name).join(", ");
                  const lastPaymentDate = getEmployeeLastPaymentDate(employee);
                  return (
                    <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-base">{employee.fullName}</h4>
                    <p className="text-sm text-muted-foreground">{employee.roles.join(" • ")}</p>
                  </div>
                  <Badge variant={employee.status === 'actif' ? 'default' : 'secondary'}>{employee.status}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{workDepartments}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{employee.phoneNumber || 'Numéro non renseigné'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <BriefcaseBusiness className="h-4 w-4" />
                    <span>{employee.hireDate ? `Embauché le ${new Date(employee.hireDate).toLocaleDateString('fr-FR')}` : 'Date d\'embauche non renseignée'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                    <WalletCards className="h-4 w-4" />
                    <span>{employee.monthlySalary ? `Salaire mensuel: ${formatCurrency(employee.monthlySalary)}` : 'Salaire mensuel non renseigné'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                    <CalendarClock className="h-4 w-4" />
                    <span>{lastPaymentDate ? `Dernier paiement le ${new Date(lastPaymentDate).toLocaleString('fr-FR')}` : 'Aucun paiement employé enregistré'}</span>
                  </div>
                </div>
                {employee.notes && <p className="text-sm text-muted-foreground rounded-lg bg-muted/40 p-3">{employee.notes}</p>}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => openEdit(employee)} className="gap-2">
                    <Pencil className="h-4 w-4" />
                    Modifier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteId(employee.id)} className="gap-2 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Modifier un employé' : 'Ajouter un employé'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom complet *</Label>
                <Input value={form.fullName} onChange={(e) => setForm(prev => ({ ...prev, fullName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Fonctions *</Label>
                <Input
                  value={form.rolesText}
                  onChange={(e) => setForm(prev => ({ ...prev, rolesText: e.target.value }))}
                  placeholder="Ex: Assistante de direction, Comptable, RH"
                />
                <p className="text-xs text-muted-foreground">Séparez plusieurs fonctions par des virgules.</p>
              </div>
            </div>
            <div className="space-y-3">
              <Label>Départements de travail *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border p-3">
                {departments.map((dept) => (
                  <label key={dept.id} className="flex items-center gap-3 rounded-md border p-2 cursor-pointer hover:bg-accent/40">
                    <Checkbox
                      checked={form.workDepartmentIds.includes(dept.id)}
                      onCheckedChange={() => setForm(prev => ({
                        ...prev,
                        workDepartmentIds: prev.workDepartmentIds.includes(dept.id)
                          ? prev.workDepartmentIds.filter(id => id !== dept.id)
                          : [...prev.workDepartmentIds, dept.id],
                      }))}
                    />
                    <span className="text-sm font-medium">{dept.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={form.phoneNumber} onChange={(e) => setForm(prev => ({ ...prev, phoneNumber: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Salaire mensuel (FCFA)</Label>
                <Input type="number" min="0" value={form.monthlySalary} onChange={(e) => setForm(prev => ({ ...prev, monthlySalary: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date d'embauche</Label>
                <Input type="date" value={form.hireDate} onChange={(e) => setForm(prev => ({ ...prev, hireDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Input value={form.status} onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value === 'inactif' ? 'inactif' : 'actif' }))} placeholder="actif ou inactif" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet employé ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action supprimera l'employé de la liste interne.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}