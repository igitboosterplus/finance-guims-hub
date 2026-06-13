import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { getAvailableConversationPartners, getMessagesForThread, getThreadSummariesForUser, markThreadAsRead, sendMessage, type Message } from "@/lib/messaging";
import { getThreadId } from "@/lib/messaging";
import { MessageCircle, Send, Users } from "lucide-react";
import { toast } from "sonner";

function formatMessageTime(dateIso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateIso));
}

export default function MessagingPage() {
  const { user } = useAuth();
  const partners = useMemo(() => (user ? getAvailableConversationPartners(user.id) : []), [user]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [contactSearch, setContactSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  const filteredPartners = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return partners;
    return partners.filter((partner) => {
      return (
        partner.displayName.toLowerCase().includes(query) ||
        partner.username.toLowerCase().includes(query)
      );
    });
  }, [partners, contactSearch]);

  const selectedPartner = filteredPartners.find((partner) => partner.id === selectedPartnerId)
    || partners.find((partner) => partner.id === selectedPartnerId)
    || filteredPartners[0]
    || partners[0]
    || null;
  const threadMessages = useMemo(() => {
    if (!user || !selectedPartner) return [];
    return getMessagesForThread(user.id, selectedPartner.id);
  }, [user, selectedPartner, refreshToken]);

  const threadSummaries = useMemo(() => {
    if (!user) return [];
    return getThreadSummariesForUser(user.id);
  }, [user, refreshToken]);

  useEffect(() => {
    if (!selectedPartnerId && partners.length > 0) {
      setSelectedPartnerId(partners[0].id);
    }
  }, [partners, selectedPartnerId]);

  useEffect(() => {
    if (selectedPartnerId && !partners.some((partner) => partner.id === selectedPartnerId)) {
      setSelectedPartnerId(partners[0]?.id || "");
    }
  }, [partners, selectedPartnerId]);

  useEffect(() => {
    if (user && selectedPartner) {
      const updated = markThreadAsRead(user.id, selectedPartner.id);
      if (updated) {
        setRefreshToken((value) => value + 1);
      }
    }
  }, [user, selectedPartner?.id]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "finance-messages") {
        setRefreshToken((value) => value + 1);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const handleFocus = () => setRefreshToken((value) => value + 1);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threadMessages.length, selectedPartner?.id]);

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !selectedPartner) return;
    if (draft.trim().length > 1200) {
      toast.error("Message trop long (max 1200 caractères)");
      return;
    }
    const result = sendMessage(user.id, selectedPartner.id, draft);
    if (!result) {
      toast.error("Écrivez un message avant d'envoyer");
      return;
    }
    setDraft("");
    setRefreshToken((value) => value + 1);
  };

  if (!user) return null;

  const currentThreadId = selectedPartner ? getThreadId(user.id, selectedPartner.id) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Communication interne</p>
          <h1 className="text-3xl font-bold tracking-tight">Messagerie</h1>
          <p className="text-muted-foreground">Discutez directement avec les autres utilisateurs approuvés.</p>
        </div>
        <Badge variant="secondary" className="w-fit gap-2">
          <MessageCircle className="h-3.5 w-3.5" /> {threadSummaries.length} conversation{threadSummaries.length > 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" /> Contacts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Rechercher un contact..."
            />
            {partners.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucun autre utilisateur approuvé pour démarrer une discussion.
              </div>
            ) : (
              <ScrollArea className="h-[420px] pr-3">
                <div className="space-y-2">
                  {filteredPartners.map((partner) => {
                    const summary = threadSummaries.find((item) => item.threadId === getThreadId(user.id, partner.id));
                    const active = partner.id === selectedPartnerId;
                    return (
                      <button
                        key={partner.id}
                        type="button"
                        onClick={() => setSelectedPartnerId(partner.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold leading-tight">{partner.displayName}</p>
                            <p className="text-xs text-muted-foreground">@{partner.username}</p>
                          </div>
                          {summary?.unreadCount ? <Badge className="bg-primary text-primary-foreground">{summary.unreadCount}</Badge> : null}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {summary ? summary.lastMessage.body : "Aucun message encore"}
                        </p>
                      </button>
                    );
                  })}
                  {filteredPartners.length === 0 && (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Aucun contact ne correspond à votre recherche.
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">
                  {selectedPartner ? `Discussion avec ${selectedPartner.displayName}` : "Aucune conversation sélectionnée"}
                </CardTitle>
                {selectedPartner && <p className="text-sm text-muted-foreground">@{selectedPartner.username}</p>}
              </div>
              {currentThreadId && <Badge variant="outline" className="w-fit">Fil: {currentThreadId.slice(0, 12)}...</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedPartner ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Sélectionnez un contact pour commencer.
              </div>
            ) : (
              <>
                <ScrollArea className="h-[420px] rounded-xl border bg-muted/20 p-4">
                  <div className="space-y-3">
                    {threadMessages.length === 0 ? (
                      <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                        Aucun message. Démarrez la conversation.
                      </div>
                    ) : (
                      threadMessages.map((message: Message) => {
                        const isMine = message.senderId === user.id;
                        return (
                          <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                              <p className={`mt-2 text-[11px] ${isMine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                {formatMessageTime(message.createdAt)}
                                {message.readAt && isMine ? " · lu" : ""}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={endOfMessagesRef} />
                  </div>
                </ScrollArea>

                <Separator />

                <form onSubmit={handleSend} className="space-y-3">
                  <Label htmlFor="message-draft">Nouveau message</Label>
                  <div className="space-y-2">
                    <Textarea
                      id="message-draft"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (draft.trim()) {
                            const form = event.currentTarget.form;
                            form?.requestSubmit();
                          }
                        }
                      }}
                      placeholder={`Écrire à ${selectedPartner.displayName}...`}
                      className="min-h-[90px] resize-y"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">Entrée pour envoyer, Maj+Entrée pour nouvelle ligne</p>
                      <p className="text-xs text-muted-foreground">{draft.length}/1200</p>
                    </div>
                    <div className="flex justify-end">
                    <Button type="submit" className="gap-2 sm:w-auto">
                      <Send className="h-4 w-4" /> Envoyer
                    </Button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}