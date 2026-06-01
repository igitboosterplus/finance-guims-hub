import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/data";
import { getEmployees, getEmployeeWithdrawalsForMonth } from "@/lib/employees";

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonth(value: string): Date {
  if (!value || !value.includes("-")) return new Date();
  const [y, m] = value.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return new Date();
  return new Date(y, m - 1, 1);
}

export function EmployeeSalaryForecast() {
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));

  const refDate = parseMonth(selectedMonth);
  const employees = getEmployees().sort((a, b) => a.fullName.localeCompare(b.fullName, "fr", { sensitivity: "base" }));

  const rows = employees.map((employee) => {
    const paid = getEmployeeWithdrawalsForMonth(employee, refDate);
    const salary = employee.monthlySalary;
    const hasSalary = !!salary && salary > 0;
    const remaining = hasSalary ? Math.max((salary || 0) - paid, 0) : null;
    const overrun = hasSalary ? Math.max(paid - (salary || 0), 0) : 0;

    return {
      employee,
      paid,
      salary,
      hasSalary,
      remaining,
      overrun,
    };
  });

  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalSalaries = rows.reduce((sum, row) => sum + (row.salary || 0), 0);
  const totalRemaining = rows.reduce((sum, row) => sum + (row.remaining || 0), 0);
  const totalOverrun = rows.reduce((sum, row) => sum + row.overrun, 0);

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg">Prévision salariale mensuelle</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Vue consolidée: payé, restant et dépassement pour tous les employés.
          </p>
        </div>
        <div className="w-full sm:w-[220px]">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border p-3 bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Salaires fixés</p>
            <p className="mt-1 text-lg font-bold">{formatCurrency(totalSalaries)}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Payé ce mois</p>
            <p className="mt-1 text-lg font-bold">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reste à payer</p>
            <p className="mt-1 text-lg font-bold text-success">{formatCurrency(totalRemaining)}</p>
          </div>
          <div className="rounded-xl border p-3 bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Dépassement</p>
            <p className="mt-1 text-lg font-bold text-destructive">{formatCurrency(totalOverrun)}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            Aucun employé enregistré.
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Salaire mensuel</TableHead>
                  <TableHead>Payé (mois)</TableHead>
                  <TableHead>Restant</TableHead>
                  <TableHead>Dépassement</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ employee, salary, paid, remaining, overrun, hasSalary }) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{employee.fullName}</p>
                        <p className="text-xs text-muted-foreground">{employee.roles.join(" • ") || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>{hasSalary ? formatCurrency(salary || 0) : "Non défini"}</TableCell>
                    <TableCell>{formatCurrency(paid)}</TableCell>
                    <TableCell className={remaining !== null && remaining > 0 ? "text-success font-medium" : ""}>
                      {remaining === null ? "—" : formatCurrency(remaining)}
                    </TableCell>
                    <TableCell className={overrun > 0 ? "text-destructive font-medium" : ""}>{formatCurrency(overrun)}</TableCell>
                    <TableCell>
                      {!hasSalary ? (
                        <Badge variant="secondary">Salaire non défini</Badge>
                      ) : overrun > 0 ? (
                        <Badge variant="destructive">Dépassement</Badge>
                      ) : (
                        <Badge variant="outline" className="text-success border-success/30 bg-success/5">Conforme</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
