import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, departments, getDepartmentStats, type DepartmentId } from "@/lib/data";
import { getCurrentUser, hasDepartmentAccess } from "@/lib/auth";

export function DepartmentAnalysis() {
  const user = getCurrentUser();
  const accessibleDepts = departments.filter(d => hasDepartmentAccess(user, d.id));

  const data = useMemo(() => {
    return accessibleDepts.map(dept => {
      const stats = getDepartmentStats(dept.id as DepartmentId);
      return {
        name: dept.name,
        revenus: stats.income,
        dépenses: stats.expenses,
        solde: stats.balance,
      };
    }).sort((a, b) => b.solde - a.solde);
  }, [accessibleDepts]);

  if (data.length === 0) return null;

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Comparaison par département</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 35 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border bg-card p-3 shadow-lg">
                      <p className="text-sm font-medium mb-1">{payload[0].payload.name}</p>
                      {payload.map((entry: any, i: number) => {
                        const colorClass = i === 0 ? 'text-emerald-500' : i === 1 ? 'text-rose-500' : 'text-blue-500';
                        return (
                          <p key={i} className={`text-xs ${colorClass}`}>
                            {entry.name}: {formatCurrency(entry.value)}
                          </p>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="revenus" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="dépenses" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="solde" fill="hsl(215, 80%, 48%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
