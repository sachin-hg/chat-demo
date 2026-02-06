"use client";

import type { ChatEvent } from "@/lib/contract-types";
import { RichText } from "./RichText";
import { PropertyCarousel } from "./templates/PropertyCarousel";
import { LoginScreen } from "./templates/LoginScreen";
import { SellerInfo } from "./templates/SellerInfo";
import { ListSelection } from "./templates/ListSelection";
import { LocalityInfo } from "./templates/LocalityInfo";

interface ChatMessageProps {
  event: ChatEvent & { eventId?: string };
  onUserAction: (event: ChatEvent) => void;
  onLoginSuccess: () => void;
  onCallNow?: () => void;
  /** When true, template CTAs and message actions are disabled (e.g. while awaiting reply). */
  actionsDisabled?: boolean;
}

const TEMPLATES = [
  "property_carousel",
  "login_screen",
  "seller_info",
  "list_selection",
  "locality_info",
] as const;

function isTemplateSupported(templateId: string): templateId is (typeof TEMPLATES)[number] {
  return TEMPLATES.includes(templateId as (typeof TEMPLATES)[number]);
}

export function ChatMessage({
  event,
  onUserAction,
  onLoginSuccess,
  onCallNow,
  actionsDisabled = false,
}: ChatMessageProps) {
  const { eventType, sender, payload } = event;
  const { messageType, content, actions } = payload;
  const isBot = sender.type === "bot";
  const isUser = sender.type === "user";

  // FE rules: don't render analytics, hidden info, context
  if (eventType === "info") {
    if (messageType === "analytics") return null;
    if (payload.visibility && payload.visibility !== "shown") return null;
  }
  if (messageType === "context") return null;

  // Visible info events use load-more–style UI (centered, muted)
  const isVisibleInfo = eventType === "info" && (payload.visibility === "shown" || !payload.visibility);
  const infoWrap = (children: React.ReactNode) => (
    <div className="flex justify-center mb-2">
      <div className="text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] max-w-[85%]">
        {children}
      </div>
    </div>
  );

  const bubbleClass = isUser
    ? "ml-auto bg-[var(--user-bubble)] text-white rounded-2xl rounded-br-md"
    : "mr-auto bg-[var(--bot-bubble)] border border-[var(--border)] text-[var(--text)] rounded-2xl rounded-bl-md";

  const wrap = (children: React.ReactNode) => (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[85%] px-4 py-2.5 ${bubbleClass}`}>{children}</div>
    </div>
  );

  const containerWrap = isVisibleInfo ? infoWrap : wrap;

  if (messageType === "user_action" && content.derivedLabel) {
    return containerWrap(<span className="text-sm">{content.derivedLabel}</span>);
  }

  if (messageType === "text" && content.text) {
    return containerWrap(<span className="text-sm whitespace-pre-wrap">{content.text}</span>);
  }

  if (messageType === "markdown" && content.text) {
    return containerWrap(<RichText value={content.text} />);
  }

  if (messageType === "html" && content.text) {
    return containerWrap(<RichText value={content.text} />);
  }

  if (messageType === "template") {
    const templateId = content.templateId ?? "";
    const data = (content.data ?? {}) as Record<string, unknown>;

    const preTextEl = content.preText ? (
      <div className="mb-2">
        <RichText value={content.preText} />
      </div>
    ) : null;

    let body: React.ReactNode = null;

    if (isTemplateSupported(templateId)) {
      switch (templateId) {
        case "property_carousel":
          body = (
            <PropertyCarousel
              properties={(data.properties as { id: string; title: string }[]) ?? []}
              actions={actions}
              messageId={payload.messageId ?? ""}
              onAction={(actionId, propertyId, msgId, derivedLabel) =>
                onUserAction({
                  eventType: "message",
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    content: {
                      data: { actionId, propertyId, messageId: msgId },
                      derivedLabel,
                    },
                  },
                } as ChatEvent)
              }
              disabled={actionsDisabled}
            />
          );
          break;
        case "login_screen":
          body = <LoginScreen onLoggedIn={onLoginSuccess} />;
          break;
        case "seller_info":
          body = (
            <SellerInfo
              data={(data as { id?: string; name?: string; image?: string; phone?: string }) ?? {}}
              onCall={onCallNow}
            />
          );
          break;
        case "list_selection":
          body = (
            <ListSelection
              properties={(data.properties as { id: string; title: string }[]) ?? []}
              messageId={payload.messageId ?? ""}
              onSelect={(selectedId, msgId, derivedLabel) =>
                onUserAction({
                  eventType: "message",
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    content: {
                      data: { selectedId, messageId: msgId },
                      derivedLabel,
                    },
                  },
                } as ChatEvent)
              }
              disabled={actionsDisabled}
            />
          );
          break;
        case "locality_info":
          body = <LocalityInfo data={(data as Record<string, unknown>) ?? {}} />;
          break;
        default:
          body = content.fallbackText ? <RichText value={content.fallbackText} /> : null;
      }
    } else {
      body = content.fallbackText ? <RichText value={content.fallbackText} /> : null;
    }

    const footerActions = actions?.filter((a) => a.scope === "message") ?? [];
    return containerWrap(
      <div className="space-y-2">
        {preTextEl}
        {body}
        {footerActions.length > 0 && (
          <div className="flex gap-2 mt-2">
            {footerActions.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={actionsDisabled}
                onClick={() => {
                  if (actionsDisabled) return;
                  if (a.replyType === "hidden" && onCallNow) {
                    onCallNow();
                  } else if (a.replyType === "visible") {
                    onUserAction({
                      eventType: "message",
                      sender: { type: "user" },
                      payload: {
                        messageType: "user_action",
                        content: {
                          data: {
                            actionId: a.id,
                            messageId: payload.messageId ?? "",
                          },
                          derivedLabel: a.label,
                        },
                      },
                    } as ChatEvent);
                  }
                }}
                className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {content.followUpText && (
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            <RichText value={content.followUpText} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
