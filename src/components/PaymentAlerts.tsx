import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, departments, type DepartmentId } from "@/lib/data";
import { type PaymentReminder } from "@/lib/stock";

interface PaymentAlertsProps {
  reminders: PaymentReminder[];
  overdue: PaymentReminder[];
}

export function PaymentAlerts({ reminders, overdue }: PaymentAlertsProps) {
  if (overdue.length === 0 && reminders.length === 0) {
    return null;
  }

  const totalOverdue = overdue.reduce((s, r) => s + r.amountDue, 0);
  const totalUpcoming = reminders.reduce((s, r) => s + r.amountDue, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Overdue */}
      {overdue.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-base text-destructive">Impayés ({overdue.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Total à récupérer</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totalOverdue)}</p>
            </div>
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {overdue.slice(0, 5).map((reminder, i) => (
                <div key={i} className="text-xs flex justify-between items-start gap-2 p-2 bg-card rounded border border-destructive/10">
                  <div>
                    <p className="font-medium">{reminder.planName}</p>
                    <p className="text-muted-foreground">{reminder.clientName}</p>
                  </div>
                  <Badge variant="destructive" className="shrink-0">{formatCurrency(reminder.amountDue)}</Badge>
                </div>
              ))}
              {overdue.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-1">+{overdue.length - 5} autres</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      {reminders.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base text-amber-600">À venir ({reminders.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Total attendu</p>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(totalUpcoming)}</p>
            </div>
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {reminders.slice(0, 5).map((reminder, i) => (
                <div key={i} className="text-xs flex justify-between items-start gap-2 p-2 bg-card rounded border border-amber-500/10">
                  <div>
                    <p className="font-medium">{reminder.planName}</p>
                    <p className="text-muted-foreground">{reminder.clientName}</p>
                    <p className="text-xs text-amber-600">Échéance: {new Date(reminder.dueDate).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{formatCurrency(reminder.amountDue)}</Badge>
                </div>
              ))}
              {reminders.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-1">+{reminders.length - 5} autres</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
