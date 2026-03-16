"use client";

import { useState } from "react";
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
  actionsDisabled?: boolean;
  onToast?: (message: string) => void;
}

const TEMPLATES = ["property_carousel", "login_screen", "seller_info", "list_selection", "locality_info"] as const;
function isTemplateSupported(id: string): id is (typeof TEMPLATES)[number] {
  return TEMPLATES.includes(id as (typeof TEMPLATES)[number]);
}

const THUMBS_DOWN_OPTIONS = [
  "Results not relevant",
  "Incorrect information",
  "Too long/too generic",
  "Slow response",
  "Tone/style issue",
];

function FeedbackRow({ onToast }: { onToast?: (msg: string) => void }) {
  const [state, setState] = useState<"neutral" | "up" | "down">("neutral");
  const [showSheet, setShowSheet] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestion, setSuggestion] = useState("");

  const handleUp = () => {
    if (state === "up") return;
    setState("up");
    onToast?.("Thank you for your feedback!");
  };

  const handleDown = () => {
    if (state === "down") {
      setShowSheet(true);
      return;
    }
    setState("down");
    setShowSheet(true);
  };

  const handleSubmitFeedback = () => {
    setShowSheet(false);
    onToast?.("Thank you for your feedback!");
  };

  const toggleOption = (opt: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  return (
    <>
      <div className="flex items-center gap-3 mt-1.5">
        {/* Thumbs up */}
        <button type="button" onClick={handleUp} className="text-[#767676] hover:text-[#111] transition-colors">
          {state === "up" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#111"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          )}
        </button>

        {/* Thumbs down */}
        <button type="button" onClick={handleDown} className="text-[#767676] hover:text-[#111] transition-colors">
          {state === "down" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#111"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
          )}
        </button>

        {/* Copy */}
        <button type="button" className="text-[#767676] hover:text-[#111] transition-colors">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>

      {/* Thumbs down bottom sheet */}
      {showSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white rounded-t-2xl px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#E8E8E8] rounded-full mx-auto mb-5" />
            <p className="font-bold text-base text-[#111] mb-4">Share feedback</p>
            <div className="space-y-2.5 mb-5">
              {THUMBS_DOWN_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left transition-colors ${
                    selected.has(opt)
                      ? "border-[#6033EE] bg-[#EDE8FF] text-[#6033EE]"
                      : "border-[#E8E8E8] text-[#111]"
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border ${selected.has(opt) ? "bg-[#6033EE] border-[#6033EE]" : "border-[#BBBBBB]"}`}>
                    {selected.has(opt) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M20 6L9 17l-5-5"/><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                  {opt}
                </button>
              ))}
            </div>
            <p className="font-semibold text-sm text-[#111] mb-2">How can we improve?</p>
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="Share your suggestions (Optional)"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-[#E8E8E8] text-sm resize-none focus:outline-none focus:border-[#6033EE] text-[#111] placeholder-[#BBBBBB]"
            />
            <button
              type="button"
              onClick={handleSubmitFeedback}
              className="w-full mt-4 py-3.5 rounded-2xl bg-[#6033EE] text-white font-semibold text-sm hover:bg-[#4f27d4] transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ChatMessage({
  event,
  onUserAction,
  onLoginSuccess,
  onCallNow,
  actionsDisabled = false,
  onToast,
}: ChatMessageProps) {
  const { sender, payload } = event;
  const { messageType, content, actions } = payload;
  const isBot = sender.type === "bot";
  const isUser = sender.type === "user";

  // Never render analytics or context
  if (messageType === "analytics") return null;
  if (messageType === "context") return null;

  // user_action: only render if visibility === "shown" and derivedLabel set
  if (messageType === "user_action") {
    if (payload.visibility === "shown" && content.derivedLabel) {
      return (
        <div className="flex justify-end mb-2 px-4">
          <div className="max-w-[80%] px-4 py-2.5 bg-white border border-[#E8E8E8] rounded-2xl rounded-br-sm shadow-sm">
            <span className="text-sm text-[#111]">{content.derivedLabel}</span>
          </div>
        </div>
      );
    }
    return null;
  }

  // User text bubble (right-aligned, white pill)
  if (isUser) {
    if (messageType === "text" && content.text) {
      return (
        <div className="flex justify-end mb-2 px-4">
          <div className="max-w-[80%] px-4 py-2.5 bg-white border border-[#E8E8E8] rounded-2xl rounded-br-sm shadow-sm">
            <span className="text-sm text-[#111] whitespace-pre-wrap">{content.text}</span>
          </div>
        </div>
      );
    }
    return null;
  }

  // Bot messages — no bubble, plain layout
  const showFeedback = isBot && payload.isFinal === true;

  // Bot text
  if (messageType === "text" && content.text) {
    return (
      <div className="mb-2 px-4">
        <p className="text-sm text-[#111] leading-relaxed">{content.text}</p>
        {showFeedback && <FeedbackRow onToast={onToast} />}
      </div>
    );
  }

  // Bot markdown
  if (messageType === "markdown" && content.text) {
    return (
      <div className="mb-2 px-4">
        <RichText value={content.text} />
        {showFeedback && <FeedbackRow onToast={onToast} />}
      </div>
    );
  }

  // Bot template
  if (messageType === "template") {
    const templateId = content.templateId ?? "";
    const data = (content.data ?? {}) as Record<string, unknown>;
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
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    responseRequired: true,
                    visibility: "shown",
                    content: { data: { actionId, propertyId, messageId: msgId }, derivedLabel },
                  },
                } as ChatEvent)
              }
              disabled={actionsDisabled}
              onToast={onToast}
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
        case "list_selection": {
          // Support both new format {title, items, canSkip} and old format {properties}
          const listTitle = (data.title as string) ?? undefined;
          const listItems = (data.items as { id: string; name: string; type: string; city: string }[]) ?? undefined;
          const canSkip = (data.canSkip as boolean) ?? false;
          const legacyProps = (data.properties as { id: string; title: string }[]) ?? undefined;
          body = (
            <ListSelection
              title={listTitle}
              items={listItems}
              properties={legacyProps}
              canSkip={canSkip}
              messageId={payload.messageId ?? ""}
              onSelect={(selectedId, msgId, derivedLabel) =>
                onUserAction({
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    responseRequired: true,
                    visibility: "shown",
                    content: { data: { selectedId, messageId: msgId }, derivedLabel },
                  },
                } as ChatEvent)
              }
              onSkip={() =>
                onUserAction({
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    responseRequired: false,
                    content: { data: { actionId: "skip_list" } },
                  },
                } as ChatEvent)
              }
              disabled={actionsDisabled}
            />
          );
          break;
        }
        case "locality_info":
          body = <LocalityInfo data={data} />;
          break;
        default:
          body = content.fallbackText ? <RichText value={content.fallbackText} /> : null;
      }
    } else {
      body = content.fallbackText ? <RichText value={content.fallbackText} /> : null;
    }

    const footerActions = actions?.filter((a) => a.scope === "message") ?? [];

    return (
      <div className="mb-2">
        <div className="px-0">
          {body}
        </div>
        {footerActions.length > 0 && (
          <div className="flex gap-2 mt-2 px-4 flex-wrap">
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
                      sender: { type: "user" },
                      payload: {
                        messageType: "user_action",
                        responseRequired: true,
                        visibility: "shown",
                        content: { data: { actionId: a.id, messageId: payload.messageId ?? "" }, derivedLabel: a.label },
                      },
                    } as ChatEvent);
                  }
                }}
                className="text-xs px-4 py-2 rounded-xl bg-[#6033EE] text-white font-medium disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {showFeedback && (
          <div className="px-4">
            <FeedbackRow onToast={onToast} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
