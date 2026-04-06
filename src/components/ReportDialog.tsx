import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReportOptions } from "@/lib/reports";

type PeriodPreset = "all" | "this-month" | "last-month" | "custom";

function getMonthRange(offset: number): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onGenerate: (opts: ReportOptions) => void;
}

export function ReportDialog({ open, onOpenChange, title, onGenerate }: ReportDialogProps) {
  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleGenerate = () => {
    let opts: ReportOptions = {};
    if (preset === "this-month") {
      const r = getMonthRange(0);
      opts = { startDate: r.start, endDate: r.end };
    } else if (preset === "last-month") {
      const r = getMonthRange(-1);
      opts = { startDate: r.start, endDate: r.end };
    } else if (preset === "custom") {
      if (startDate) opts.startDate = startDate;
      if (endDate) opts.endDate = endDate;
    }
    onGenerate(opts);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choisissez la période du rapport à générer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Période</Label>
            <Select value={preset} onValueChange={v => setPreset(v as PeriodPreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les dates</SelectItem>
                <SelectItem value="this-month">Ce mois-ci</SelectItem>
                <SelectItem value="last-month">Mois dernier</SelectItem>
                <SelectItem value="custom">Période personnalisée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date début</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date fin</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleGenerate}>Générer le PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
