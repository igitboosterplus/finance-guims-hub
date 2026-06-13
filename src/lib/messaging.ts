import { getAllUsers, type User } from "@/lib/auth";

const MESSAGES_KEY = "finance-messages";

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt?: string;
}

export interface MessageThreadSummary {
  threadId: string;
  otherUser: User;
  lastMessage: Message;
  unreadCount: number;
}

function readMessages(): Message[] {
  const raw = localStorage.getItem(MESSAGES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}

export function getThreadId(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join("::");
}

export function getMessagesForThread(userAId: string, userBId: string): Message[] {
  const threadId = getThreadId(userAId, userBId);
  return readMessages()
    .filter((message) => getThreadId(message.senderId, message.recipientId) === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getThreadSummariesForUser(userId: string): MessageThreadSummary[] {
  const messages = readMessages();
  const users = getAllUsers().filter((user) => user.approved && user.id !== userId);
  const summaries = new Map<string, MessageThreadSummary>();

  for (const user of users) {
    const threadId = getThreadId(userId, user.id);
    const threadMessages = messages
      .filter((message) => getThreadId(message.senderId, message.recipientId) === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (threadMessages.length === 0) continue;

    const lastMessage = threadMessages[threadMessages.length - 1];
    const unreadCount = threadMessages.filter((message) => message.recipientId === userId && !message.readAt).length;

    summaries.set(threadId, {
      threadId,
      otherUser: user,
      lastMessage,
      unreadCount,
    });
  }

  return Array.from(summaries.values()).sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
}

export function sendMessage(senderId: string, recipientId: string, body: string): Message | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const messages = readMessages();
  const message: Message = {
    id: crypto.randomUUID(),
    senderId,
    recipientId,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };

  messages.push(message);
  saveMessages(messages);
  return message;
}

export function markThreadAsRead(userId: string, otherUserId: string): boolean {
  const messages = readMessages();
  let changed = false;

  const updated = messages.map((message) => {
    if (message.senderId === otherUserId && message.recipientId === userId && !message.readAt) {
      changed = true;
      return { ...message, readAt: new Date().toISOString() };
    }
    return message;
  });

  if (changed) {
    saveMessages(updated);
  }

  return changed;
}

export function getAvailableConversationPartners(currentUserId: string): User[] {
  return getAllUsers()
    .filter((user) => user.approved && user.id !== currentUserId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function getUnreadMessageCountForUser(userId: string): number {
  return readMessages().filter((message) => message.recipientId === userId && !message.readAt).length;
}