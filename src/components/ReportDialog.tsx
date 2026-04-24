import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReportOptions } from "@/lib/reports";
import { getConfiguredAIProviders, getPreferredAIProvider, type AIProvider } from "@/lib/aiReports";

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
  onGenerate: (opts: ReportOptions) => Promise<void> | void;
}

export function ReportDialog({ open, onOpenChange, title, onGenerate }: ReportDialogProps) {
  const providers = getConfiguredAIProviders();
  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [personName, setPersonName] = useState("");
  const [useAI, setUseAI] = useState(providers.length > 0);
  const [aiProvider, setAiProvider] = useState<AIProvider | "auto">(getPreferredAIProvider() || "auto");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreset("all");
    setStartDate("");
    setEndDate("");
    setPersonName("");
    setUseAI(providers.length > 0);
    setAiProvider(getPreferredAIProvider() || "auto");
  }, [open, providers.length]);

  const handleGenerate = async (mode: "download" | "preview") => {
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
    if (personName.trim()) opts.personName = personName.trim();
    if (providers.length > 0) {
      opts.useAI = useAI;
      if (useAI && aiProvider !== "auto") {
        opts.aiProvider = aiProvider;
      }
    }
    opts.reportMode = mode;
    setIsGenerating(true);
    try {
      await onGenerate(opts);
      onOpenChange(false);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choisissez la période et/ou la personne du rapport à générer.</DialogDescription>
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
          <div className="space-y-2">
            <Label>Filtrer par personne (optionnel)</Label>
            <Input
              placeholder="Nom de la personne..."
              value={personName}
              onChange={e => setPersonName(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">Laissez vide pour inclure toutes les personnes</p>
          </div>
          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <Label>Analyse IA du rapport</Label>
            {providers.length > 0 ? (
              <>
                <Select value={useAI ? aiProvider : "disabled"} onValueChange={(value) => {
                  if (value === "disabled") {
                    setUseAI(false);
                    return;
                  }
                  setUseAI(true);
                  setAiProvider(value as AIProvider | "auto");
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Désactiver l'IA externe</SelectItem>
                    <SelectItem value="auto">Choix automatique</SelectItem>
                    {providers.includes("gemini") && <SelectItem value="gemini">Gemini</SelectItem>}
                    {providers.includes("openai") && <SelectItem value="openai">OpenAI</SelectItem>}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Le rapport inclura une synthèse enrichie par IA si une clé API est configurée.</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Aucune clé OpenAI ou Gemini détectée. Le rapport utilisera l'analyse locale enrichie.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Annuler</Button>
          <Button variant="outline" onClick={() => handleGenerate("preview")} disabled={isGenerating}>{isGenerating ? "Génération..." : "Aperçu"}</Button>
          <Button onClick={() => handleGenerate("download")} disabled={isGenerating}>{isGenerating ? "Génération..." : "Télécharger"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
