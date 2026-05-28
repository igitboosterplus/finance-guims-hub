import { useMemo, useState } from "react";
import { Sparkles, Send, Bot, User, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { departments, formatCurrency, getMonthlyStats, getTransactions, type DepartmentId } from "@/lib/data";
import { getCurrentUser, hasDepartmentAccess } from "@/lib/auth";
import { generateExternalAIConversation, getConfiguredAIProviders, getPreferredAIProvider } from "@/lib/aiReports";
import { toast } from "sonner";

type Message = {
  role: "user" | "assistant";
  text: string;
  source?: "external-ai" | "local-fallback";
};

function buildLocalReply(question: string, txs: ReturnType<typeof getTransactions>, departmentLabel: string): string {
  const now = new Date();
  const monthly = getMonthlyStats(now.getFullYear(), now.getMonth());
  const income = txs.filter(tx => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = txs.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const balance = income - expenses;

  const expenseByCategory = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) || 0) + tx.amount);
  }
  const topExpense = [...expenseByCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  const q = question.toLowerCase();
  const lines: string[] = [];
  lines.push(`Analyse comptable (${departmentLabel}).`);

  if (q.includes("solde") || q.includes("balance")) {
    lines.push(`- Solde cumule: ${formatCurrency(balance)}.`);
  }
  if (q.includes("depense") || q.includes("dépense") || q.includes("cout") || q.includes("coût")) {
    lines.push(`- Depenses cumulees: ${formatCurrency(expenses)}.`);
    if (topExpense) {
      lines.push(`- Plus gros poste de depense: ${topExpense[0]} (${formatCurrency(topExpense[1])}).`);
    }
  }
  if (q.includes("revenu") || q.includes("encaisse") || q.includes("encaisser")) {
    lines.push(`- Revenus cumules: ${formatCurrency(income)}.`);
  }

  if (lines.length === 1) {
    lines.push(`- Revenus cumules: ${formatCurrency(income)}.`);
    lines.push(`- Depenses cumulees: ${formatCurrency(expenses)}.`);
    lines.push(`- Solde cumule: ${formatCurrency(balance)}.`);
  }

  lines.push(`- Mois en cours (global): revenus ${formatCurrency(monthly.income)}, depenses ${formatCurrency(monthly.expenses)}, solde ${formatCurrency(monthly.balance)}.`);
  lines.push("Conseil: pose une question plus precise (periode, departement, categorie, caisse) pour une reponse plus ciblée.");

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

  const askAI = async () => {
    const q = question.trim();
    if (!q) {
      toast.error("Saisissez votre question");
      return;
    }

    const userMessage: Message = { role: "user", text: q };
    setMessages(prev => [...prev, userMessage]);
    setQuestion("");

    const fallback = buildLocalReply(q, filteredTransactions, departmentLabel);

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
            monthlyGlobal: (() => {
              const now = new Date();
              return getMonthlyStats(now.getFullYear(), now.getMonth());
            })(),
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
