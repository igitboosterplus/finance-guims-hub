import { Card, CardContent } from "@/components/ui/card";
import { type LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/data";

interface StatsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  colorClass?: string;
  isCurrency?: boolean;
}

export function StatsCard({ title, value, icon: Icon, colorClass = "", isCurrency = true }: StatsCardProps) {
  return (
    <Card className="hover:shadow-lg transition-all duration-300 border-0 shadow-md overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className={`h-6 w-6 ${colorClass || 'text-primary'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={`text-xl font-bold mt-0.5 truncate ${colorClass}`}>
              {isCurrency ? formatCurrency(value) : value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
