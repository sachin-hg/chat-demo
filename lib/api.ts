import type {
  ChatEvent,
  SendMessageResponse,
  GetHistoryResponse,
  GetConversationIdResponse,
  GetChatsResponse,
} from "./contract-types";

const BASE = "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getConversationId(demo?: boolean): Promise<GetConversationIdResponse> {
  const url = demo ? "/api/chats/get-conversation-id?demo=true" : "/api/chats/get-conversation-id";
  return get(url);
}

export async function getChats(): Promise<GetChatsResponse> {
  return get("/api/chats/get-chats");
}

export async function getHistory(
  conversationId: string,
  params?: {
    page?: number;
    page_size?: number;
    messages_after?: string;
    messages_before?: string;
    last?: number;
  }
): Promise<GetHistoryResponse> {
  const sp = new URLSearchParams({ conversationId });
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
  if (params?.messages_after) sp.set("messages_after", params.messages_after);
  if (params?.messages_before) sp.set("messages_before", params.messages_before);
  if (params?.last != null) sp.set("last", String(params.last));
  return get(`/api/chats/get-history?${sp}`);
}

export async function sendMessage(event: ChatEvent): Promise<SendMessageResponse> {
  return post<SendMessageResponse>("/api/chats/send-message", { event });
}

function parseSseEventBlock(block: string): { event?: string; data?: string } {
  let eventName: string | undefined;
  let data: string | undefined;

  const lines = block.split("\n");
  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      // In this repo we only send a single data line with JSON payload.
      data = line.slice("data:".length).trim();
    }
  }

  return { event: eventName, data };
}

export async function sendMessageStream(
  event: ChatEvent,
  handlers: {
    onAck: (ack: SendMessageResponse) => void;
    onChatEvent: (ev: ChatEvent & { eventId: string; createdAt?: string }) => void;
  },
  options?: { signal?: AbortSignal }
): Promise<void> {
  const res = await fetch("/api/chats/send-message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ event }),
    signal: options?.signal,
  });

  if (!res.ok) throw new Error(await res.text());
  if (!res.body) return;

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE blocks are delimited by a blank line.
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Ignore comments like ": connected"
      if (trimmed.startsWith(":")) continue;

      const { event: eventName, data } = parseSseEventBlock(trimmed);
      if (!eventName || !data) continue;

      if (eventName === "connection_ack") {
        const ack = JSON.parse(data) as SendMessageResponse;
        handlers.onAck(ack);
        continue;
      }

      if (eventName === "chat_event") {
        const ev = JSON.parse(data) as ChatEvent & { eventId: string; createdAt?: string };
        handlers.onChatEvent(ev);
        continue;
      }

      if (eventName === "connection_close") {
        return;
      }
    }
  }
}

export async function cancelRequest(eventId: string): Promise<{ ok: boolean }> {
  return post("/api/chats/cancel", { eventId });
}

export function getStreamUrl(conversationId: string): string {
  return `${BASE}/api/chats/stream?conversationId=${encodeURIComponent(conversationId)}`;
}
