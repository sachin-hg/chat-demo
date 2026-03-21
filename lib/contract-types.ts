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
  messageState: "IN_PROGRESS" | "COMPLETED" | "ERRORED_AT_ML";
  error?: { code: string; message: string };
  /** Optional ML response context snapshot for downstream consumers. */
  summarisedChatContext?: Record<string, unknown>;
  isVisible?: boolean;
  
  sequenceNumber: number;
  
  content: ChatPayloadContent;
}

export interface ChatEventToUser {
  conversationId: string;

  messageId: string;
  sourceMessageId?: string; // not really required by FE in phase 1
  messageType: MessageType;
  messageState: MessageState;
  /** Optional ML response context snapshot for downstream consumers. */
  summarisedChatContext?: Record<string, unknown>;
  createdAt: string;

  responseRequired: boolean; // mandatory where sender === user
  isVisible?: boolean; // mandatory where sender === user && messageType === user_action
  
  sequenceNumber?: number; // mandatory where sender === bot
  
  sender: Sender;
  content: ChatPayloadContent;
  // Used by BE -> FE (SSE/chat history/send-message responses).
  // Can represent sender types: user | bot | system.
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
