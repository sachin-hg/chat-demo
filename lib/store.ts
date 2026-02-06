import type { ChatEvent } from "./contract-types";

const CONV_ID = "conv_1";

export type RequestState =
  | "PENDING"
  | "COMPLETED"
  | "ERRORED_AT_ML"
  | "TIMED_OUT_BY_BE"
  | "CANCELLED_BY_USER";

export interface ChatRequest {
  requestId: string;
  conversationId: string;
  userEventId: string;
  state: RequestState;
  createdAt: string;
  updatedAt: string;
}

export interface StoredEvent extends ChatEvent {
  eventId: string;
  createdAt: string;
}

type SSEClient = (data: string) => void;

const events: StoredEvent[] = [];
const requests: ChatRequest[] = [];
const sseClients: Map<string, Set<SSEClient>> = new Map();

let eventCounter = 100;
let requestCounter = 900;

function nextEventId() {
  return `evt_${++eventCounter}`;
}
function nextRequestId() {
  return `req_${++requestCounter}`;
}

function now() {
  return new Date().toISOString();
}

export function getConversationId(): { conversationId: string; isNew: boolean } {
  const isNew = events.length === 0;
  return { conversationId: CONV_ID, isNew };
}

export function getChats() {
  if (events.length === 0) {
    return { chats: [] };
  }
  const last = events[events.length - 1];
  const first = events[0];
  return {
    chats: [
      {
        conversationId: CONV_ID,
        createdAt: first.createdAt,
        lastActivityAt: last.createdAt,
      },
    ],
  };
}

export function getHistory(
  conversationId: string,
  options?: {
    page?: number;
    pageSize?: number;
    messagesAfter?: string;
    messagesBefore?: string;
    last?: number;
  }
): {
  conversationId: string;
  messages: StoredEvent[];
  hasMore: boolean;
} {
  // Per architecture: user request event is soft-deleted only for CANCELLED_BY_USER — exclude from history
  const cancelledUserEventIds = new Set(
    requests.filter((r) => r.state === "CANCELLED_BY_USER").map((r) => r.userEventId)
  );
  let list = events.filter(
    (e) =>
      (e.conversationId === conversationId || !e.conversationId) && !cancelledUserEventIds.has(e.eventId)
  );

  if (options?.last != null) {
    const n = Math.max(0, options.last);
    const hasMore = list.length > n;
    const messages = list.slice(-n);
    return {
      conversationId: CONV_ID,
      messages: messages as StoredEvent[],
      hasMore,
    };
  }

  if (options?.messagesBefore) {
    const idx = list.findIndex((e) => e.eventId === options.messagesBefore);
    const pageSize = options?.pageSize ?? 10;
    if (idx <= 0) {
      return {
        conversationId: CONV_ID,
        messages: [],
        hasMore: false,
      };
    }
    const beforeList = list.slice(0, idx);
    const hasMore = beforeList.length > pageSize;
    const messages = beforeList.slice(-pageSize);
    return {
      conversationId: CONV_ID,
      messages: messages as StoredEvent[],
      hasMore,
    };
  }

  if (options?.messagesAfter) {
    const idx = list.findIndex((e) => e.eventId === options.messagesAfter);
    list = idx >= 0 ? list.slice(idx + 1) : list;
  } else if (options?.page !== undefined && options?.pageSize !== undefined) {
    const start = options.page * options.pageSize;
    list = list.slice(start, start + options.pageSize + 1);
  }

  const hasMore = options?.page !== undefined && options?.pageSize !== undefined && list.length > options.pageSize;
  const messages = hasMore ? list.slice(0, options!.pageSize!) : list;

  return {
    conversationId: CONV_ID,
    messages: messages as StoredEvent[],
    hasMore,
  };
}

export function appendEvent(
  event: Omit<StoredEvent, "eventId" | "createdAt"> & { eventId?: string; createdAt?: string }
): StoredEvent {
  const stored: StoredEvent = {
    ...event,
    eventId: event.eventId ?? nextEventId(),
    createdAt: event.createdAt ?? now(),
  };
  events.push(stored);
  // SSE is for bot → FE only; FE already has the user message from send-message response (dedupe)
  if (stored.sender.type === "bot") {
    broadcast(CONV_ID, stored);
  }
  return stored;
}

export function createRequest(userEventId: string): ChatRequest {
  const req: ChatRequest = {
    requestId: nextRequestId(),
    conversationId: CONV_ID,
    userEventId,
    state: "PENDING",
    createdAt: now(),
    updatedAt: now(),
  };
  requests.push(req);
  return req;
}

export function completeRequest(requestId: string) {
  const r = requests.find((x) => x.requestId === requestId);
  if (r && r.state === "PENDING") {
    r.state = "COMPLETED";
    r.updatedAt = now();
  }
}

export function cancelRequest(requestId: string) {
  const r = requests.find((x) => x.requestId === requestId);
  if (r && r.state === "PENDING") {
    r.state = "CANCELLED_BY_USER";
    r.updatedAt = now();
  }
}

export function isPending(requestId: string): boolean {
  const r = requests.find((x) => x.requestId === requestId);
  return r ? r.state === "PENDING" : false;
}

export function hasPendingRequest(conversationId: string): boolean {
  return requests.some(
    (r) => (r.conversationId === conversationId || !r.conversationId) && r.state === "PENDING"
  );
}

function broadcast(conversationId: string, event: StoredEvent) {
  
  const clients = sseClients.get(conversationId);
  console.log("broadcast", "convId: ", conversationId, "eventId: ", event.eventId, "sender: ", event.sender.type, "messageType: ", event.payload.messageType, "eventType: ", event.eventType, "clients: ", clients?.size);
  if (!clients?.size) return;
  const payload = JSON.stringify(event);
  const line = `id: ${event.eventId}\nevent: chat_event\ndata: ${payload}\n\n`;
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
  eventCounter = 100;
  requestCounter = 900;
}
