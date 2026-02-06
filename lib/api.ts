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

export async function cancelRequest(requestId: string): Promise<{ ok: boolean }> {
  return post("/api/chats/cancel", { requestId });
}

export function getStreamUrl(conversationId: string): string {
  return `${BASE}/api/chats/stream?conversationId=${encodeURIComponent(conversationId)}`;
}
