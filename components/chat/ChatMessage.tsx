"use client";

import { useState } from "react";
import type { ChatEvent } from "@/lib/contract-types";
import { RichText } from "./RichText";
import { PropertyCarousel } from "./templates/PropertyCarousel";
import { LoginScreen } from "./templates/LoginScreen";
import { SellerInfo } from "./templates/SellerInfo";
import { NestedQna } from "./templates/NestedQna";
import type { NestedQnaSelection } from "./templates/NestedQna";
import { LocalityInfo } from "./templates/LocalityInfo";
import { PriceTrend } from "./templates/PriceTrend";
import { DownloadBrochure } from "./templates/DownloadBrochure";
import { ShareLocation } from "./templates/ShareLocation";
import { ShortlistProperty } from "./templates/ShortlistProperty";

interface ChatMessageProps {
  event: ChatEvent & { eventId?: string };
  onUserAction: (event: ChatEvent) => void;
  onLoginSuccess: () => void;
  onCallNow?: () => void;
  onShareLocation?: () => void;
  onDenyLocation?: () => void;
  actionsDisabled?: boolean;
  onToast?: (message: string) => void;
}

const TEMPLATES = [
  "property_carousel",
  "login_screen",
  "seller_info",
  "locality_info",
  "locality_carousel",
  "price_trend",
  "download_brochure",
  "share_location",
  "shortlist_property",
  "nested_qna",
] as const;
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
  onShareLocation,
  onDenyLocation,
  actionsDisabled = false,
  onToast,
}: ChatMessageProps) {
  const { sender, payload } = event;
  const { messageType, content } = payload;
  const isBot = sender.type === "bot";
  const isUser = sender.type === "user";

  // Never render analytics or context
  if (messageType === "analytics") return null;
  if (messageType === "context") return null;

  // user_action: only render if visibility === "shown" and derivedLabel set
  if (messageType === "user_action") {
    if (payload.visibility === "shown" && content.derivedLabel) {
      return (
        <div className="flex justify-end mb-2">
          <div className="max-w-[75%] px-4 py-3 pl-3 bg-[var(--user-bubble)] border border-[var(--user-bubble-border)] rounded-[24px] shadow-sm">
            <span className="text-sm text-[#222] leading-[1.35]">{content.derivedLabel}</span>
          </div>
        </div>
      );
    }
    return null;
  }

  // User text bubble (scout-bot: white, border #f5f5f5, radius 24px)
  if (isUser) {
    if (messageType === "text" && content.text) {
      return (
        <div className="flex justify-end mb-2">
          <div className="max-w-[75%] px-4 py-3 pl-3 bg-[var(--user-bubble)] border border-[var(--user-bubble-border)] rounded-[24px] shadow-sm">
            <span className="text-sm text-[#222] leading-[1.35] whitespace-pre-wrap">{content.text}</span>
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
      <div className="mb-2">
        <p className="text-sm text-[#0a0a0a] leading-[1.35]">{content.text}</p>
        {showFeedback && <FeedbackRow onToast={onToast} />}
      </div>
    );
  }

  // Bot markdown — no bubble per design; plain content with .rich-text typography
  if (messageType === "markdown" && content.text) {
    return (
      <div className="mb-2">
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
              messageId={payload.messageId ?? ""}
              onAction={(actionId, propertyId, msgId, derivedLabel) =>
                onUserAction({
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    responseRequired: true,
                    visibility: "shown",
                    content: {
                      data:
                        actionId === "learn_more_about_property"
                          ? { action: actionId, messageId: msgId, property: { propertyId, service: "buy", category: "residential", type: "project" } }
                          : { actionId, propertyId, messageId: msgId },
                      derivedLabel,
                    },
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
        case "nested_qna": {
          const selections = (data as { selections?: NestedQnaSelection[] }).selections;
          if (!Array.isArray(selections) || selections.length === 0) break;
          const canSkip = (data.canSkip as boolean) ?? false;
          body = (
            <NestedQna
              selections={selections}
              canSkip={canSkip}
              messageId={payload.messageId ?? ""}
              onComplete={(payloadData, derivedLabel) =>
                onUserAction({
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    responseRequired: true,
                    visibility: "shown",
                    content: {
                      data: {
                        action: payloadData.action,
                        selections: payloadData.selections,
                        messageId: payload.messageId,
                      },
                      derivedLabel,
                    },
                  },
                } as ChatEvent)
              }
              onSkip={
                canSkip
                  ? () =>
                      onUserAction({
                        sender: { type: "user" },
                        payload: {
                          messageType: "user_action",
                          responseRequired: false,
                          content: { data: { actionId: "skip_list" } },
                        },
                      } as ChatEvent)
                  : undefined
              }
              disabled={actionsDisabled}
            />
          );
          break;
        }
        case "locality_info":
        case "locality_carousel":
          body = (
            <LocalityInfo
              data={templateId === "locality_carousel" && data.localities != null ? { localities: data.localities } : data}
              messageId={payload.messageId ?? ""}
              onAction={(actionId, localityId, msgId, derivedLabel) =>
                onUserAction({
                  sender: { type: "user" },
                  payload: {
                    messageType: "user_action",
                    responseRequired: true,
                    visibility: "shown",
                    content: {
                      data: { action: actionId, locality: { localityUuid: localityId } },
                      derivedLabel,
                    },
                  },
                } as ChatEvent)
              }
              disabled={actionsDisabled}
            />
          );
          break;
        case "price_trend":
          body = <PriceTrend data={data} />;
          break;
        case "download_brochure":
          body = <DownloadBrochure data={data} />;
          break;
        case "share_location":
          body = (
            <ShareLocation
              data={data}
              onShareLocation={onShareLocation}
              onDenyLocation={onDenyLocation}
            />
          );
          break;
        case "shortlist_property":
          body = <ShortlistProperty data={data} />;
          break;
        default:
          body = null;
      }
    } else {
      body = null;
    }

    return (
      <div className="mb-2">
        <div className="px-0">
          {body}
        </div>
        {showFeedback && (
          <div>
            <FeedbackRow onToast={onToast} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
