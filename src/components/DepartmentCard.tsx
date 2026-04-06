import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { formatCurrency, type Department, getDepartmentStats } from "@/lib/data";
import { ArrowUpRight, ArrowDownRight, TrendingUp, ChevronRight } from "lucide-react";

interface DepartmentCardProps {
  department: Department;
}

export function DepartmentCard({ department }: DepartmentCardProps) {
  const navigate = useNavigate();
  const stats = getDepartmentStats(department.id);

  return (
    <Card
      className="cursor-pointer group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden border-0 shadow-md"
      onClick={() => navigate(`/department/${department.id}`)}
    >
      <CardContent className="p-0">
        {/* Header with logo */}
        <div className={`${department.bgLightClass} p-4 flex items-center gap-3 border-b border-border/50`}>
          <img
            src={department.logo}
            alt={department.name}
            className="h-12 w-12 rounded-xl object-cover shadow-sm bg-card"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-foreground truncate">{department.name}</h3>
            <p className="text-[11px] text-muted-foreground line-clamp-1">{department.description}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </div>

        {/* Stats */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowUpRight className="h-3.5 w-3.5 text-success" />
              Revenus
            </span>
            <span className="font-semibold text-success">{formatCurrency(stats.income)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
              Dépenses
            </span>
            <span className="font-semibold text-destructive">{formatCurrency(stats.expenses)}</span>
          </div>
          <div className="border-t pt-3 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Solde
            </span>
            <span className={`font-bold text-base ${stats.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(stats.balance)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
