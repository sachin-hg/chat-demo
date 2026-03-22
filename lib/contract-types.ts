// Chat API Contract v1.0 types

export type MessageType =
  | "context"
  | "text"
  | "template"
  | "user_action"
  | "markdown"
  | "analytics";
export type SenderType = "user" | "bot" | "system";
export type MessageState =
  | "PENDING"
  | "COMPLETED"
  | "IN_PROGRESS"
  | "ERRORED_AT_ML"
  | "TIMED_OUT_BY_BE"
  | "CANCELLED_BY_USER";

/**
 * ML progress for the **user message** identified by `sourceMessageId` (the “turn”), not the state of an individual
 * bot **part** row. Each bot response part has its own `messageId`; `sourceMessageState` repeats/updates until the turn completes.
 * BE maps this onto the **stored user row’s** `messageState` in the DB.
 */
export type SourceMessageState = "IN_PROGRESS" | "COMPLETED" | "ERRORED_AT_ML";

export interface Sender {
  type: SenderType;
}

export interface SenderForML extends Sender {
  // Derived by BE from auth/identity request headers.
  userId?: string;
  gaId?: string;
}

export interface ChatPayloadContent {
  text?: string;
  templateId?: string;
  /** For user_action, data should include action-specific fields and may include replyToMessageId. */
  data?: Record<string, unknown>;
  /** Set by FE when sending user_action; displayed as user bubble when isVisible === true. */
  derivedLabel?: string;
}

export interface ChatEventFromUser {
  // Required in send-message/send-message-streamed request body event.
  conversationId: string;
  sender: Sender;
  messageType: MessageType;
  content: ChatPayloadContent;
  responseRequired: boolean;
  isVisible?: boolean;
  // Used by send-message APIs for FE -> BE.
}



export interface ChatEventToML {
  conversationId: string;
  
  messageId: string;
  messageType: MessageType;
  messageState: "PENDING";
  createdAt: string;
  
  sender: SenderForML;
  content: ChatPayloadContent;
  responseRequired: boolean;
  
}

export interface CancelEventToML {
  
  sender: SenderForML;

  conversationId: string;

  messageIdToCancel?: string;
  cancelReason: "CANCELLED_BY_USER" | "TIMED_OUT_BY_BE";
  
}

export interface ChatEventFromML {
  // Used by ML -> BE.
  conversationId: string;
  sender: Sender;

  sourceMessageId: string;
  messageType: MessageType;
  /** ML’s progress completing the turn for `sourceMessageId` — not the lifecycle of this part’s row. */
  sourceMessageState: SourceMessageState;
  error?: { code: string; message: string };
  isVisible?: boolean;

  sequenceNumber: number;

  content: ChatPayloadContent;
}

export interface ChatEventToUser {
  conversationId: string;

  /** Unique id for this **row** (each bot “part” / partial response has its own `messageId`). */
  messageId: string;
  sourceMessageId?: string;
  messageType: MessageType;
  /**
   * **User / system rows:** lifecycle of that message (PENDING, COMPLETED, …).
   * **Bot ML rows:** each persisted **part** is typically `COMPLETED` once stored; use **`sourceMessageState`** for ML’s
   * progress on the parent user turn (`sourceMessageId`).
   */
  messageState: MessageState;
  /**
   * Present on **bot** (ML) rows with `sourceMessageId`: ML’s progress on answering that user message (`IN_PROGRESS` → more
   * parts may follow; `COMPLETED` / `ERRORED_AT_ML` → terminal for the turn). Not the state of the part row itself.
   */
  sourceMessageState?: SourceMessageState;
  createdAt: string;

  /** Set on user/system-originated rows; omitted on bot messages (BE → FE). */
  responseRequired?: boolean;
  isVisible?: boolean; // mandatory where sender === user && messageType === user_action

  sequenceNumber?: number; // mandatory where sender === bot

  sender: Sender;
  content: ChatPayloadContent;
  // Used by BE -> FE (SSE/chat history/send-message responses).
  // Can represent sender types: user | bot | system.
}

/** For UI/terminals: bot rows use `sourceMessageState` when set; otherwise `messageState`. */
export function getTurnOrMessageState(ev: ChatEventToUser): MessageState | SourceMessageState {
  if (ev.sender.type === "bot" && ev.sourceMessageId && ev.sourceMessageState != null) {
    return ev.sourceMessageState;
  }
  return ev.messageState;
}

export type ChatEvent =
  | ChatEventFromUser
  | ChatEventToML
  | CancelEventToML
  | ChatEventFromML
  | ChatEventToUser;

export interface SendMessageResponse {
  messageId: string;
  messageState?: MessageState;
}

export interface GetHistoryResponse {
  conversationId: string;
  messages: ChatEventToUser[];
  hasMore: boolean;
}

export interface GetConversationIdResponse {
  conversationId: string;
  isNew: boolean;
}

export interface GetChatsResponse {
  chats: { conversationId: string; createdAt: string; lastActivityAt: string }[];
}
