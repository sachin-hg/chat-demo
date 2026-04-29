import type {
  ChatEventFromUser,
  ChatEventToUser,
  SendMessageResponse,
  MessageDeltaEventToUser,
} from "./contract-types";

const PROD_ENABLED =
  process.env.NEXT_PUBLIC_PROD === "true" || process.env.PROD === "true";
const BASE = PROD_ENABLED ? "https://platform-chatbot.housing.com" : "";
let loginAuthToken: string | null = null;
let tokenId: string | null = null;
let didHydrateFromCookies = false;

const COOKIE_HOUZY_TOKEN = "houzy_token";
const COOKIE_LOGIN_AUTH_TOKEN = "login_auth_token";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p) continue;
    const eq = p.indexOf("=");
    const k = eq === -1 ? p : p.slice(0, eq);
    if (k === name) {
      const v = eq === -1 ? "" : p.slice(eq + 1);
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string, opts?: { maxAgeSeconds?: number }): void {
  if (!isBrowser()) return;
  const enc = encodeURIComponent(value);
  const maxAge = opts?.maxAgeSeconds ?? 60 * 60 * 24 * 365 * 10; // ~10 years
  document.cookie = `${name}=${enc}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function hydrateAuthFromCookiesOnce(): void {
  if (didHydrateFromCookies) return;
  didHydrateFromCookies = true;
  loginAuthToken = readCookie(COOKIE_LOGIN_AUTH_TOKEN);
  tokenId = readCookie(COOKIE_HOUZY_TOKEN);
}

function withAuthHeaders(headers: Record<string, string>): Record<string, string> {
  hydrateAuthFromCookiesOnce();
  const out: Record<string, string> = { ...headers };
  if (loginAuthToken) out["login-auth-token"] = loginAuthToken;
  if (tokenId) out["token_id"] = tokenId;
  return out;
}

export function setLoginAuthToken(token: string | null): void {
  loginAuthToken = token;
  didHydrateFromCookies = true;
  if (token && token.trim()) writeCookie(COOKIE_LOGIN_AUTH_TOKEN, token.trim());
  else deleteCookie(COOKIE_LOGIN_AUTH_TOKEN);
}

export function setTokenId(tid: string | null): void {
  tokenId = tid;
  didHydrateFromCookies = true;
  if (tid && tid.trim()) writeCookie(COOKIE_HOUZY_TOKEN, tid.trim());
  else deleteCookie(COOKIE_HOUZY_TOKEN);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: withAuthHeaders({}) });
  if (!res.ok) throw new Error(await res.text());
  const payload = await res.json();
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    ("statusCode" in payload || "responseCode" in payload)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const payload = await res.json();
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    ("statusCode" in payload || "responseCode" in payload)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export type GetConversationDetailsResponse = {
  conversationId: string;
  tokenId: string;
  messages: ChatEventToUser[];
  hasMore: boolean;
  isNew: boolean;
};

export async function getConversationDetails(params?: {
  pageSize?: number;
  messagesAfter?: string;
  messagesBefore?: string;
}): Promise<GetConversationDetailsResponse> {
  const sp = new URLSearchParams();
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params?.messagesAfter) sp.set("messagesAfter", params.messagesAfter);
  if (params?.messagesBefore) sp.set("messagesBefore", params.messagesBefore);
  if (params?.messagesAfter && params?.messagesBefore) {
    throw new Error("messagesAfter and messagesBefore cannot be used together");
  }
  const qs = sp.toString();
  const res = await get<GetConversationDetailsResponse>(
    `/api/v1/chat/get-conversation-details${qs ? `?${qs}` : ""}`
  );
  // Persist token in cookie ("houzy_token") so the first page-load call can send it.
  if (res?.tokenId) setTokenId(res.tokenId);
  return res;
}

export async function sendMessage(event: ChatEventFromUser): Promise<SendMessageResponse> {
  return post<SendMessageResponse>("/api/v1/chat/send-message", event);
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
  event: ChatEventFromUser,
  handlers: {
    onAck: (ack: SendMessageResponse) => void;
    onChatEvent: (ev: ChatEventToUser & { messageId: string; createdAt?: string }) => void;
    /** Fired when the server sends `connection_close` (normal end of the turn). */
    onConnectionClose?: () => void;
    /**
     * Fired when the HTTP response body ends **without** a `connection_close` SSE event
     * (e.g. network drop, proxy reset, or `MOCK_SSE_RANDOM_DROP_PROBABILITY` on the server).
     * Use this to refetch `get-history` and reconcile UI.
     */
    onStreamDisconnected?: () => void | Promise<void>;
    /** v1.1 incremental text; optional when `streamingEnabled` is false on the request. */
    onMessageDelta?: (delta: MessageDeltaEventToUser) => void;
  },
  options?: { signal?: AbortSignal; streamingEnabled?: boolean }
): Promise<void> {
  let sawConnectionClose = false;
  const qs =
    options?.streamingEnabled === true
      ? "?streamingEnabled=true"
      : "";
  const res = await fetch(`${BASE}/api/v1/chat/send-message-streamed${qs}`, {
    method: "POST",
    headers: withAuthHeaders({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }),
    body: JSON.stringify(event),
    signal: options?.signal,
  });

  if (!res.ok) throw new Error(await res.text());
  if (!res.body) return;

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";

  try {
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
          const ev = JSON.parse(data) as ChatEventToUser & { messageId: string; createdAt?: string };
          handlers.onChatEvent(ev);
          continue;
        }

        if (eventName === "message_delta") {
          const delta = JSON.parse(data) as MessageDeltaEventToUser;
          handlers.onMessageDelta?.(delta);
          continue;
        }

        if (eventName === "connection_close") {
          sawConnectionClose = true;
          await handlers.onConnectionClose?.();
          return;
        }
      }
    }
  } finally {
    if (!sawConnectionClose && !options?.signal?.aborted) {
      await handlers.onStreamDisconnected?.();
    }
  }
}

export async function cancelRequest(
  messageId: string,
  conversationId: string
): Promise<{ ok: boolean }> {
  return post("/api/v1/chat/cancel", { messageId, conversationId });
}

export async function migrateChat(
  currentConversationId: string
): Promise<{ newConversationId?: string }> {
  const sp = new URLSearchParams({ currentConversationId });
  const res = await fetch(`${BASE}/api/v1/chat/migrate-chat?${sp}`, {
    method: "POST",
    headers: withAuthHeaders({}),
  });
  if (!res.ok) throw new Error(await res.text());
  const payload = await res.json();
  return {
    newConversationId: payload?.data?.new_conversation_id ?? undefined,
  };
}

export function getStreamUrl(conversationId: string): string {
  return `${BASE}/api/v1/chat/stream?conversationId=${encodeURIComponent(conversationId)}`;
}
