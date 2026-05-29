import { useMemo, useState } from "react";
import { Sparkles, Send, Bot, User, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { departments, formatCurrency, getMonthlyStats, getTransactions } from "@/lib/data";
import { getAuditLog, getCurrentUser, hasDepartmentAccess, hasPermission } from "@/lib/auth";
import { generateExternalAIConversation, getConfiguredAIProviders, getPreferredAIProvider } from "@/lib/aiReports";
import { toast } from "sonner";
import { getTransactionTimestamp } from "@/lib/transactionDates";

type Message = {
  role: "user" | "assistant";
  text: string;
  source?: "external-ai" | "local-fallback";
};

type PeriodKey = "today" | "week" | "month" | "all";

type LocalIntent = {
  period: PeriodKey;
  wantsInteractionsReport: boolean;
  wantsBalance: boolean;
  wantsIncome: boolean;
  wantsExpenses: boolean;
  wantsTopCategory: boolean;
  wantsRecentMovements: boolean;
  wantsComparison: boolean;
};

const isSameLocalDay = (left: string, right: Date) => {
  const leftDate = new Date(getTransactionTimestamp(left));
  return (
    leftDate.getFullYear() === right.getFullYear() &&
    leftDate.getMonth() === right.getMonth() &&
    leftDate.getDate() === right.getDate()
  );
};

const ACTION_LABELS: Record<string, string> = {
  create: "Creation",
  update: "Modification",
  delete: "Suppression",
};

const normalizeQuestion = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (day - 1));
  return d;
};

const isWithinPeriod = (isoValue: string, period: PeriodKey, now: Date) => {
  const ts = getTransactionTimestamp(isoValue);
  const target = new Date(ts);
  if (period === "all") return true;
  if (period === "today") return isSameLocalDay(isoValue, now);
  if (period === "week") return ts >= startOfWeek(now).getTime();
  if (period === "month") {
    return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
  }
  return true;
};

const periodLabel = (period: PeriodKey, now: Date) => {
  if (period === "today") return `aujourd'hui (${now.toLocaleDateString("fr-FR")})`;
  if (period === "week") return "cette semaine";
  if (period === "month") return `ce mois (${now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })})`;
  return "toute la periode";
};

const parseIntent = (question: string): LocalIntent => {
  const q = normalizeQuestion(question);
  const period: PeriodKey =
    /(aujourd|ce jour|du jour|today|journee)/.test(q)
      ? "today"
      : /(semaine|hebdo|7\s*jours|7j)/.test(q)
        ? "week"
        : /(mois|mensuel|mensuelle|month)/.test(q)
          ? "month"
          : "all";

  const asksInteractions = /(interaction|audit|journal|mouvement|mouvements|operation|operations|activite|activites|action|actions)/.test(q);
  const asksReport = /(rapport|bilan|resume|resumer|montre|donne|liste|detail|details)/.test(q);

  return {
    period,
    wantsInteractionsReport: asksInteractions && asksReport,
    wantsBalance: /(solde|balance|net|ecart)/.test(q),
    wantsIncome: /(revenu|recette|encaisse|entree|entrees)/.test(q),
    wantsExpenses: /(depense|depenses|cout|couts|sortie|sorties|charges)/.test(q),
    wantsTopCategory: /(plus gros|principal|top|categorie|poste)/.test(q),
    wantsRecentMovements: /(dernier|derniers|recent|recents|historique)/.test(q),
    wantsComparison: /(compar|vs|contre|evolution|variation|tendance)/.test(q),
  };
};

const topByCategory = (txs: ReturnType<typeof getTransactions>, type: "income" | "expense") => {
  const grouped = new Map<string, number>();
  txs.filter(tx => tx.type === type).forEach((tx) => {
    grouped.set(tx.category, (grouped.get(tx.category) || 0) + tx.amount);
  });
  return [...grouped.entries()].sort((a, b) => b[1] - a[1])[0];
};

const defaultSuggestedPrompts = [
  "Donne-moi le rapport des interactions et mouvements d'aujourd'hui",
  "Quel est mon solde cette semaine et les postes de depense majeurs ?",
  "Compare ce mois avec la semaine en cours",
  "Quels sont les 5 derniers mouvements critiques ?",
];

function buildLocalReply(
  question: string,
  txs: ReturnType<typeof getTransactions>,
  departmentLabel: string,
  auditEntries: Array<{ username: string; action: string; details: string; timestamp: string }>,
  canViewAudit: boolean,
): string {
  const now = new Date();
  const intent = parseIntent(question);
  const scopedTxs = txs
    .filter(tx => isWithinPeriod(tx.createdAt || tx.date, intent.period, now))
    .sort((a, b) => getTransactionTimestamp(b.createdAt || b.date) - getTransactionTimestamp(a.createdAt || a.date));

  const scopedAudit = auditEntries
    .filter(entry => isWithinPeriod(entry.timestamp, intent.period, now))
    .sort((a, b) => getTransactionTimestamp(b.timestamp) - getTransactionTimestamp(a.timestamp));

  const monthly = getMonthlyStats(now.getFullYear(), now.getMonth());
  const income = scopedTxs.filter(tx => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = scopedTxs.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const balance = income - expenses;

  if (scopedTxs.length === 0 && !intent.wantsInteractionsReport) {
    return [
      `Aucune operation comptable trouvee pour ${periodLabel(intent.period, now)} sur ${departmentLabel}.`,
      "Conseil: elargissez la periode (semaine/mois) ou changez de departement.",
    ].join("\n");
  }

  if (intent.wantsInteractionsReport) {
    const actionCounts = {
      create: scopedAudit.filter(item => item.action === "create").length,
      update: scopedAudit.filter(item => item.action === "update").length,
      delete: scopedAudit.filter(item => item.action === "delete").length,
    };

    const lines: string[] = [];
    lines.push(`Resume executif — interactions et mouvements (${periodLabel(intent.period, now)}) — ${departmentLabel}.`);
    lines.push(`- Mouvements comptables: ${scopedTxs.length} operation(s).`);
    lines.push(`- Revenus: ${formatCurrency(income)}.`);
    lines.push(`- Depenses: ${formatCurrency(expenses)}.`);
    lines.push(`- Impact net: ${formatCurrency(balance)}.`);

    if (canViewAudit && scopedAudit.length > 0) {
      lines.push(`- Interactions systeme (audit): ${scopedAudit.length} action(s) [Creation ${actionCounts.create}, Modification ${actionCounts.update}, Suppression ${actionCounts.delete}].`);
      lines.push("- Dernieres interactions:");
      scopedAudit.slice(0, 8).forEach((entry) => {
        lines.push(`  • ${new Date(entry.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} - ${ACTION_LABELS[entry.action] || entry.action} par ${entry.username}: ${entry.details}`);
      });
    } else if (canViewAudit) {
      lines.push("- Interactions systeme (audit): aucune action visible sur ce perimetre.");
    } else {
      lines.push("- Interactions systeme (audit): acces non autorise pour votre role.");
    }

    if (scopedTxs.length > 0) {
      lines.push("- Derniers mouvements comptables:");
      scopedTxs.slice(0, 10).forEach((tx) => {
        const sign = tx.type === "income" ? "+" : "-";
        lines.push(`  • ${new Date(tx.createdAt || tx.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} - ${tx.category} (${tx.personName || "Sans nom"}) : ${sign}${formatCurrency(tx.amount)}`);
      });
    }

    if (scopedTxs.length > 0) {
      lines.push("- Actions recommandees:");
      if (balance < 0) lines.push("  • Prioriser les encaissements a court terme pour reduire le deficit de la periode.");
      if (actionCounts.delete > 0) lines.push("  • Verifier les suppressions dans le journal d'audit pour confirmer leur legitimite.");
      if (actionCounts.update > actionCounts.create) lines.push("  • Revoir les modifications nombreuses pour detecter d'eventuels ajustements repetitifs.");
    }

    return lines.join("\n");
  }

  const topExpense = topByCategory(scopedTxs, "expense");
  const topIncome = topByCategory(scopedTxs, "income");
  const q = normalizeQuestion(question);
  const lines: string[] = [];
  lines.push(`Resume executif (${departmentLabel}) — ${periodLabel(intent.period, now)}.`);

  if (intent.wantsBalance) {
    lines.push(`- Solde cumule: ${formatCurrency(balance)}.`);
  }
  if (intent.wantsExpenses) {
    lines.push(`- Depenses: ${formatCurrency(expenses)}.`);
    if (topExpense) {
      lines.push(`- Plus gros poste de depense: ${topExpense[0]} (${formatCurrency(topExpense[1])}).`);
    }
  }
  if (intent.wantsIncome) {
    lines.push(`- Revenus: ${formatCurrency(income)}.`);
    if (topIncome) {
      lines.push(`- Plus grosse categorie de revenu: ${topIncome[0]} (${formatCurrency(topIncome[1])}).`);
    }
  }
  if (intent.wantsTopCategory && !intent.wantsIncome && !intent.wantsExpenses) {
    if (topExpense) lines.push(`- Top depense: ${topExpense[0]} (${formatCurrency(topExpense[1])}).`);
    if (topIncome) lines.push(`- Top revenu: ${topIncome[0]} (${formatCurrency(topIncome[1])}).`);
  }
  if (intent.wantsRecentMovements) {
    lines.push("- Derniers mouvements:");
    scopedTxs.slice(0, 5).forEach((tx) => {
      const sign = tx.type === "income" ? "+" : "-";
      lines.push(`  • ${new Date(tx.createdAt || tx.date).toLocaleString("fr-FR")} - ${tx.category} : ${sign}${formatCurrency(tx.amount)}`);
    });
  }

  if (intent.wantsComparison) {
    const weekTxs = txs.filter(tx => isWithinPeriod(tx.createdAt || tx.date, "week", now));
    const monthTxs = txs.filter(tx => isWithinPeriod(tx.createdAt || tx.date, "month", now));
    const weekBal = weekTxs.reduce((s, tx) => s + (tx.type === "income" ? tx.amount : -tx.amount), 0);
    const monthBal = monthTxs.reduce((s, tx) => s + (tx.type === "income" ? tx.amount : -tx.amount), 0);
    lines.push(`- Comparatif: solde semaine ${formatCurrency(weekBal)} vs solde mois ${formatCurrency(monthBal)}.`);
  }

  const avgExpense = scopedTxs.filter(tx => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0) /
    Math.max(1, scopedTxs.filter(tx => tx.type === "expense").length);
  const unusualExpenses = scopedTxs
    .filter(tx => tx.type === "expense" && tx.amount >= avgExpense * 2 && avgExpense > 0)
    .slice(0, 3);
  if (unusualExpenses.length > 0) {
    lines.push("- Alertes depenses atypiques:");
    unusualExpenses.forEach((tx) => {
      lines.push(`  • ${tx.category} (${tx.personName || "Sans nom"}) : ${formatCurrency(tx.amount)}.`);
    });
  }

  if (lines.length === 1) {
    lines.push(`- Revenus: ${formatCurrency(income)}.`);
    lines.push(`- Depenses: ${formatCurrency(expenses)}.`);
    lines.push(`- Solde: ${formatCurrency(balance)}.`);
    if (topExpense) lines.push(`- Top depense: ${topExpense[0]} (${formatCurrency(topExpense[1])}).`);
  }

  lines.push(`- Mois en cours (global): revenus ${formatCurrency(monthly.income)}, depenses ${formatCurrency(monthly.expenses)}, solde ${formatCurrency(monthly.balance)}.`);
  lines.push("Conseil: precise la periode (aujourd'hui, semaine, mois) et le type (interactions, mouvements, solde, depenses, revenus).\nExemple: Donne-moi le rapport des interactions et mouvements aujourd'hui.");

  return lines.join("\n");
}

export default function AIAccountingChatPage() {
  const currentUser = getCurrentUser();
  const accessibleDepartments = departments.filter(dept => hasDepartmentAccess(currentUser, dept.id));
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Bonjour. Je peux repondre a vos questions comptables en utilisant vos transactions synchronisees. Exemple: Quel est mon solde de ce mois pour GABA ?",
      source: "local-fallback",
    },
  ]);

  const providers = getConfiguredAIProviders();
  const preferredProvider = getPreferredAIProvider();
  const [provider, setProvider] = useState<"auto" | "openai" | "gemini">(preferredProvider || "auto");
  const canViewAudit = hasPermission(currentUser, "canViewAudit");

  const filteredTransactions = useMemo(() => {
    const all = getTransactions();
    if (departmentId === "all") {
      const allowedIds = new Set(accessibleDepartments.map(dept => dept.id));
      return all.filter(tx => allowedIds.has(tx.departmentId));
    }
    return all.filter(tx => tx.departmentId === departmentId);
  }, [departmentId, accessibleDepartments]);

  const departmentLabel = departmentId === "all"
    ? "Tous les departements autorises"
    : (departments.find(dept => dept.id === departmentId)?.name || departmentId);

  const allAuditEntries = useMemo(() => {
    if (!canViewAudit) return [] as Array<{ username: string; action: string; details: string; timestamp: string }>;

    return getAuditLog()
      .sort((a, b) => getTransactionTimestamp(b.timestamp) - getTransactionTimestamp(a.timestamp))
      .map((entry) => ({
        username: entry.username,
        action: entry.action,
        details: entry.details,
        timestamp: entry.timestamp,
      }));
  }, [canViewAudit]);

  const askAI = async () => {
    const q = question.trim();
    if (!q) {
      toast.error("Saisissez votre question");
      return;
    }

    const userMessage: Message = { role: "user", text: q };
    setMessages(prev => [...prev, userMessage]);
    setQuestion("");

    const normalizedQ = q.toLowerCase();
    const intent = parseIntent(normalizedQ);

    const now = new Date();
    const scopedTxs = filteredTransactions
      .filter(tx => isWithinPeriod(tx.createdAt || tx.date, intent.period, now))
      .sort((a, b) => getTransactionTimestamp(b.createdAt || b.date) - getTransactionTimestamp(a.createdAt || a.date));

    const scopedAudit = allAuditEntries.filter(entry => isWithinPeriod(entry.timestamp, intent.period, now));

    const fallback = buildLocalReply(q, filteredTransactions, departmentLabel, allAuditEntries, canViewAudit);

    let externalReply: string | null = null;
    if (providers.length > 0) {
      setLoading(true);
      externalReply = await generateExternalAIConversation(
        {
          question: q,
          context: {
            scope: {
              departmentId: departmentId === "all" ? null : departmentId,
              departmentLabel,
            },
            metrics: {
              totalTransactions: filteredTransactions.length,
              totalIncome: filteredTransactions.filter(tx => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0),
              totalExpenses: filteredTransactions.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0),
            },
            intentHints: {
              period: intent.period,
              wantsInteractionsReport: intent.wantsInteractionsReport,
              wantsBalance: intent.wantsBalance,
              wantsIncome: intent.wantsIncome,
              wantsExpenses: intent.wantsExpenses,
              instruction: intent.wantsInteractionsReport
                ? "Priorite absolue: renvoyer un rapport operationnel sur les interactions/mouvements de la periode demandee. Eviter les totaux dashboard hors periode."
                : "",
            },
            monthlyGlobal: (() => {
              const now = new Date();
              return getMonthlyStats(now.getFullYear(), now.getMonth());
            })(),
            scopedPeriod: {
              label: periodLabel(intent.period, now),
              transactions: {
                count: scopedTxs.length,
                income: scopedTxs.filter(tx => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0),
                expenses: scopedTxs.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0),
              },
              audit: canViewAudit
                ? {
                    count: scopedAudit.length,
                    create: scopedAudit.filter(item => item.action === "create").length,
                    update: scopedAudit.filter(item => item.action === "update").length,
                    delete: scopedAudit.filter(item => item.action === "delete").length,
                    recent: scopedAudit.slice(0, 20),
                  }
                : { hidden: true },
            },
            recentTransactions: filteredTransactions
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 60)
              .map(tx => ({
                date: tx.date,
                departmentId: tx.departmentId,
                type: tx.type,
                paymentMethod: tx.paymentMethod,
                category: tx.category,
                personName: tx.personName,
                amount: tx.amount,
                description: tx.description,
              })),
          },
          conversationHistory: messages.slice(-8).map(msg => ({ role: msg.role, text: msg.text })),
        },
        provider === "auto" ? preferredProvider : provider,
      );
      setLoading(false);
    }

    if (externalReply && intent.wantsInteractionsReport) {
      const looksGeneric = /(mois en cours|tableau de bord|solde cumule)/i.test(externalReply);
      if (looksGeneric) {
        externalReply = null;
        toast.info("Reponse IA externe trop generique, rapport local detaille applique.");
      }
    }

    setMessages(prev => [
      ...prev,
      {
        role: "assistant",
        text: externalReply || fallback,
        source: externalReply ? "external-ai" : "local-fallback",
      },
    ]);

    if (!externalReply && providers.length > 0) {
      toast.info("IA externe indisponible, reponse locale utilisee.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Chat IA Comptabilite
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <p className="text-sm text-muted-foreground">
                Posez vos questions sur vos revenus, depenses, soldes et tendances. Le chat utilise vos donnees internes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {defaultSuggestedPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-[11px] h-7"
                    onClick={() => setQuestion(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Portee des donnees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous mes departements</SelectItem>
                  {accessibleDepartments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={provider} onValueChange={(value) => setProvider(value as "auto" | "openai" | "gemini")}>
                <SelectTrigger>
                  <SelectValue placeholder="Fournisseur IA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {providers.includes("openai") && <SelectItem value="openai">OpenAI</SelectItem>}
                  {providers.includes("gemini") && <SelectItem value="gemini">Gemini</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 max-h-[430px] overflow-y-auto space-y-3">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    <span className="text-[11px] opacity-80">{msg.role === "user" ? "Vous" : "Assistant"}</span>
                    {msg.role === "assistant" && msg.source && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {msg.source === "external-ai" ? "IA externe" : "Local"}
                      </Badge>
                    )}
                  </div>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Ex: Quelle categorie me coute le plus ce mois-ci dans GABA ?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!loading) void askAI();
                }
              }}
            />
            <Button onClick={() => void askAI()} disabled={loading} className="gap-2">
              <Send className="h-4 w-4" />
              Envoyer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setMessages([
                {
                  role: "assistant",
                  text: "Conversation reinitialisee. Je suis pret pour votre prochaine question comptable.",
                  source: "local-fallback",
                },
              ])}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
