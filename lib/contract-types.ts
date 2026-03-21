// Chat API Contract v1.0 types

export type MessageType =
  | "context"
  | "text"
  | "template"
  | "user_action"
  | "markdown"
  | "analytics";
export type SenderType = "user" | "bot" | "system";
export type RequestState =
  | "PENDING"
  | "COMPLETED"
  | "ERRORED_AT_ML"
  | "TIMED_OUT_BY_BE"
  | "CANCELLED_BY_USER";

export interface Sender {
  type: SenderType;
  id?: string;
}

export interface ChatPayloadContent {
  text?: string;
  templateId?: string;
  data?: Record<string, unknown>;
  /** Optional ML response context snapshot for downstream consumers. */
  context?: Record<string, unknown>;
  /** Set by FE when sending user_action; displayed as user bubble when visibility === "shown". */
  derivedLabel?: string;
}

export interface ChatPayload {
  messageId?: string;
  /** BE-generated ID relayed to ML; ML echoes on all response messages for turn correlation. Required for bot. */
  sourceMessageId?: string;
  /** 0-based index within response sequence. Required for bot. */
  sequenceNumber?: number;
  /** true = last message in response sequence. Required for bot. */
  isFinal?: boolean;
  /** Applies to user text (always true) and user_action (conditional). */
  responseRequired?: boolean;
  messageType: MessageType;
  /** Only for user_action. Hidden by default; 'shown' renders derivedLabel as user bubble. */
  visibility?: "shown" | "hidden";
  content: ChatPayloadContent;
}

export interface ChatEvent {
  eventId?: string;
  /** Request lifecycle state for this event/turn as resolved by BE. */
  requestState?: RequestState;
  conversationId?: string;
  loginAuthToken?: string;
  sender: Sender;
  payload: ChatPayload;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface SendMessageResponse {
  eventId: string;
  requestState?: RequestState;
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
