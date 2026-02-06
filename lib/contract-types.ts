// Chat API Contract v1.0 types

export type EventType = "message" | "info";
export type MessageType =
  | "context"
  | "text"
  | "template"
  | "user_action"
  | "markdown"
  | "html"
  | "analytics";
export type SenderType = "user" | "bot" | "system";
export type ReplyType = "visible" | "hidden";
export type ActionScope = "message" | "template_item";

export interface Sender {
  type: SenderType;
  id?: string;
}

export interface ChatAction {
  id: string;
  label: string;
  replyType: ReplyType;
  scope: ActionScope;
}

export interface ChatPayloadContent {
  text?: string;
  templateId?: string;
  data?: Record<string, unknown>;
  preText?: string;
  fallbackText?: string;
  followUpText?: string;
  derivedLabel?: string;
}

export interface ChatPayload {
  messageId?: string;
  messageType: MessageType;
  visibility?: "shown" | "hidden";
  content: ChatPayloadContent;
  actions?: ChatAction[];
}

export interface ChatEvent {
  eventId?: string;
  conversationId?: string;
  eventType: EventType;
  loginAuthToken?: string;
  sender: Sender;
  payload: ChatPayload;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface SendMessageResponse {
  eventId: string;
  requestId: string;
  expectResponse: boolean;
  timeoutMs?: number; // optional; FE may use fixed 60s when expectResponse is true
}

export interface GetHistoryResponse {
  conversationId: string;
  messages: (ChatEvent & { eventId: string; createdAt: string })[];
  hasMore: boolean;
}

export interface GetConversationIdResponse {
  conversationId: string;
  isNew: boolean;
}

export interface GetChatsResponse {
  chats: { conversationId: string; createdAt: string; lastActivityAt: string }[];
}
