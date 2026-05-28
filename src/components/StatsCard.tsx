import { Card, CardContent } from "@/components/ui/card";
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/data";

interface StatsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  colorClass?: string;
  isCurrency?: boolean;
  /** Percentage change vs previous period. Positive = up, negative = down. null = no data. */
  trend?: number | null;
  /** If true, a lower value is considered good (e.g. expenses). Default false. */
  invertTrend?: boolean;
}

export function StatsCard({ title, value, icon: Icon, colorClass = "", isCurrency = true, trend, invertTrend = false }: StatsCardProps) {
  const trendGood = trend !== undefined && trend !== null
    ? (invertTrend ? trend < 0 : trend > 0)
    : null;

  return (
    <Card className="hover:shadow-lg transition-all duration-300 border-0 shadow-md overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className={`h-6 w-6 ${colorClass || 'text-primary'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={`text-xl font-bold mt-0.5 truncate ${colorClass}`}>
              {isCurrency ? formatCurrency(value) : value}
            </p>
            {trend !== undefined && trend !== null && (
              <div className={`flex items-center gap-0.5 mt-1 text-xs font-medium ${trendGood ? 'text-emerald-500' : 'text-rose-500'}`}>
                {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                <span>{trend > 0 ? '+' : ''}{trend}% vs mois préc.</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
