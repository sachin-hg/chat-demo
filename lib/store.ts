import type { ChatEvent, SenderType } from "./contract-types";

const DEFAULT_CONV_ID = "c1";
const MIGRATED_CONV_ID = "c2";
let activeAnonConversationId = DEFAULT_CONV_ID;
let activeLoggedInConversationId: string | null = null;
let loggedInSeeded = false;

export type MessageState =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ERRORED_AT_ML"
  | "TIMED_OUT_BY_BE"
  | "CANCELLED_BY_USER";

export interface ChatRequest {
  conversationId: string;
  userMessageId: string;
  state: MessageState;
  createdAt: string;
  updatedAt: string;
}

export interface StoredEvent extends ChatEvent {
  messageId: string;
  createdAt: string;
}

type SSEClient = (data: string) => void;

const events: StoredEvent[] = [];
const requests: ChatRequest[] = [];
const sseClients: Map<string, Set<SSEClient>> = new Map();

function nextMessageId() {
  // Use randomness to prevent messageId collisions if the mock store module
  // gets reloaded / instantiated more than once in dev.
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

export function getConversationId(): { conversationId: string; isNew: boolean } {
  const conversationId = activeLoggedInConversationId ?? activeAnonConversationId;
  const isNew = events.filter((e) => e.conversationId === conversationId).length === 0;
  return { conversationId, isNew };
}

export function getChats() {
  if (events.length === 0) {
    return { chats: [] };
  }
  const convs = new Map<string, { first: string; last: string }>();
  for (const ev of events) {
    const cid = ev.conversationId ?? DEFAULT_CONV_ID;
    const rec = convs.get(cid);
    if (!rec) convs.set(cid, { first: ev.createdAt, last: ev.createdAt });
    else rec.last = ev.createdAt;
  }
  const chats = [...convs.entries()]
    .map(([conversationId, v]) => ({
      conversationId,
      createdAt: v.first,
      lastActivityAt: v.last,
    }))
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  return { chats };
}

export function getHistory(
  conversationId: string,
  options?: {
    pageSize?: number;
    messagesAfter?: string;
    messagesBefore?: string;
  }
): {
  conversationId: string;
  messages: StoredEvent[];
  hasMore: boolean;
} {
  // Per architecture: user request event is soft-deleted only for CANCELLED_BY_USER — exclude from history
  const cancelledUserMessageIds = new Set(
    requests.filter((r) => r.state === "CANCELLED_BY_USER").map((r) => r.userMessageId)
  );
  let list = events.filter(
    (e) =>
      (e.conversationId === conversationId || !e.conversationId) && !cancelledUserMessageIds.has(e.messageId)
  );
  const pageSize = Math.max(1, options?.pageSize ?? 6);

  // Explicit window: latest `pageSize` messages before `messages_before` (exclusive).
  if (options?.messagesBefore && !options?.messagesAfter) {
    const idx = list.findIndex((e) => e.messageId === options.messagesBefore);
    if (idx <= 0) {
      return {
        conversationId,
        messages: [],
        hasMore: false,
      };
    }
    const beforeList = list.slice(0, idx);
    const hasMore = beforeList.length > pageSize;
    const messages = beforeList.slice(-pageSize);
    const messagesWithState = messages.map((e) => withMessageState(e));
    return {
      conversationId,
      messages: messagesWithState as StoredEvent[],
      hasMore,
    };
  }

  // Explicit window: all messages strictly after `messages_after`.
  if (options?.messagesAfter && !options?.messagesBefore) {
    const idx = list.findIndex((e) => e.messageId === options.messagesAfter);
    list = idx >= 0 ? list.slice(idx + 1) : [];
    const messagesWithState = list.map((e) => withMessageState(e));
    return {
      conversationId,
      messages: messagesWithState as StoredEvent[],
      hasMore: false,
    };
  }

  // Implicit window (no cursor): latest `pageSize` messages.
  const hasMore = list.length > pageSize;
  const messages = list.slice(-pageSize);

  const messagesWithState = messages.map((e) => withMessageState(e));
  return {
    conversationId,
    messages: messagesWithState as StoredEvent[],
    hasMore,
  };
}

export function appendEvent(
  event: Omit<StoredEvent, "messageId" | "createdAt"> & { messageId?: string; createdAt?: string }
): StoredEvent {
  const generatedMessageId = event.messageId ?? nextMessageId();
  const stored: StoredEvent = {
    ...event,
    messageId: generatedMessageId,
    // BE guarantees a messageId on all persisted events.
    messageType: event.messageType,
    content: event.content,
    createdAt: event.createdAt ?? now(),
  };
  events.push(stored);
  // SSE is for bot → FE only; FE already has the user message from send-message response (dedupe)
  if (stored.sender.type === "bot") {
    broadcast(stored.conversationId ?? DEFAULT_CONV_ID, stored);
  }
  return stored;
}

export function createRequest(userMessageId: string, conversationId: string = DEFAULT_CONV_ID): ChatRequest {
  const req: ChatRequest = {
    conversationId,
    userMessageId,
    state: "PENDING",
    createdAt: now(),
    updatedAt: now(),
  };
  requests.push(req);
  return req;
}

export function completeRequest(userMessageId: string) {
  const r = requests.find((x) => x.userMessageId === userMessageId);
  if (r && (r.state === "PENDING" || r.state === "IN_PROGRESS")) {
    r.state = "COMPLETED";
    r.updatedAt = now();
  }
}

export function cancelRequest(userMessageId: string) {
  const r = requests.find((x) => x.userMessageId === userMessageId);
  if (r && r.state === "PENDING") {
    r.state = "CANCELLED_BY_USER";
    r.updatedAt = now();
  }
}

export function cancelRequestByUserMessageId(userMessageId: string) {
  const r = requests.find((x) => x.userMessageId === userMessageId);
  if (r && (r.state === "PENDING" || r.state === "IN_PROGRESS")) {
    r.state = "CANCELLED_BY_USER";
    r.updatedAt = now();
  }
}

export function isPending(userMessageId: string): boolean {
  const r = requests.find((x) => x.userMessageId === userMessageId);
  return r ? r.state === "PENDING" || r.state === "IN_PROGRESS" : false;
}

export function getMessageState(userMessageId: string): MessageState | undefined {
  return requests.find((x) => x.userMessageId === userMessageId)?.state;
}

export function getMessageStateByUserMessageId(userMessageId: string): MessageState | undefined {
  return requests.find((x) => x.userMessageId === userMessageId)?.state;
}

export function updateMessageStateByUserMessageId(
  userMessageId: string,
  nextState: MessageState
): void {
  const r = requests.find((x) => x.userMessageId === userMessageId);
  if (!r) return;
  if (r.state === "CANCELLED_BY_USER") return;
  r.state = nextState;
  r.updatedAt = now();
}

export function hasPendingRequest(conversationId: string): boolean {
  return requests.some(
    (r) =>
      (r.conversationId === conversationId || !r.conversationId) &&
      (r.state === "PENDING" || r.state === "IN_PROGRESS")
  );
}

function broadcast(conversationId: string, event: StoredEvent) {
  
  const clients = sseClients.get(conversationId);
  console.log("broadcast", "convId: ", conversationId, "messageId: ", event.messageId, "sender: ", event.sender.type, "messageType: ", event.messageType, "clients: ", clients?.size);
  if (!clients?.size) return;
  const payload = JSON.stringify(event);
  const line = `id: ${event.messageId}\nevent: chat_event\ndata: ${payload}\n\n`;
  clients.forEach((write) => {
    try {
      write(line);
    } catch (_) {}
  });
}

export function subscribeSSE(conversationId: string, write: SSEClient): () => void {
  if (!sseClients.has(conversationId)) {
    sseClients.set(conversationId, new Set());
  }
  sseClients.get(conversationId)!.add(write);
  return () => {
    sseClients.get(conversationId)?.delete(write);
  };
}

export function getAllEvents(): StoredEvent[] {
  return [...events];
}

export function resetStore() {
  events.length = 0;
  requests.length = 0;
  activeAnonConversationId = DEFAULT_CONV_ID;
  activeLoggedInConversationId = null;
  loggedInSeeded = false;
}

function getRequestByUserMessageId(userMessageId: string): ChatRequest | undefined {
  return requests.find((r) => r.userMessageId === userMessageId);
}

function getRequestBySourceMessageId(sourceMessageId?: string): ChatRequest | undefined {
  if (!sourceMessageId) return undefined;
  const userEvent = events.find(
    (e) => e.sender.type === "user" && e.messageId === sourceMessageId
  );
  if (!userEvent?.messageId) return undefined;
  return getRequestByUserMessageId(userEvent.messageId);
}

function resolveMessageState(event: StoredEvent): MessageState | undefined {
  // user-originated request event
  const direct = getRequestByUserMessageId(event.messageId);
  if (direct) return direct.state;

  // bot responses tied through sourceMessageId
  const fromSource = getRequestBySourceMessageId(event.sourceMessageId);
  if (fromSource) return fromSource.state;

  return undefined;
}

function withMessageState(event: StoredEvent): StoredEvent {
  if (event.messageState) return event;
  const resolved = resolveMessageState(event);
  if (!resolved) return event;
  return {
    ...event,
    messageState: resolved,
  };
}

function pushEventWithoutBroadcast(event: Omit<StoredEvent, "messageId" | "createdAt"> & { messageId?: string; createdAt?: string }) {
  const generatedMessageId = event.messageId ?? nextMessageId();
  const stored: StoredEvent = {
    ...event,
    messageId: generatedMessageId,
    messageType: event.messageType,
    content: event.content,
    createdAt: event.createdAt ?? now(),
  };
  events.push(stored);
}

function seedLoggedInConversationIfNeeded(conversationId: string) {
  if (loggedInSeeded) return;
  loggedInSeeded = true;
  pushEventWithoutBroadcast({
    conversationId,
    sender: { type: "user" },
    messageType: "text",
    content: { text: "Show me 3 BHK in Gurgaon" },
    createdAt: "2026-01-06T10:00:00.000Z",
  });
  pushEventWithoutBroadcast({
    conversationId,
    sender: { type: "bot" },
    messageType: "text",
    sourceMessageId: "msg_old_1",
    sequenceNumber: 0,
    isFinal: true,
    content: { text: "Here are some older recommendations from your previous logged-in chat." },
    createdAt: "2026-01-06T10:00:02.000Z",
  });
}

export function migrateConversation(currentConversationId: string): { newConversationId: string; migrated: boolean } {
  const newConversationId = MIGRATED_CONV_ID;
  seedLoggedInConversationIfNeeded(newConversationId);

  events.forEach((e) => {
    if ((e.conversationId ?? DEFAULT_CONV_ID) === currentConversationId) {
      e.conversationId = newConversationId;
    }
  });
  requests.forEach((r) => {
    if ((r.conversationId ?? DEFAULT_CONV_ID) === currentConversationId) {
      r.conversationId = newConversationId;
    }
  });
  activeLoggedInConversationId = newConversationId;
  return { newConversationId, migrated: true };
}
