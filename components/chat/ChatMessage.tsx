"use client";

import type { ChatEventFromUser, ChatEventToUser } from "@/lib/contract-types";
import { RichText } from "./RichText";
import { PropertyCarousel, getClipboardTextForPropertyCarousel } from "./templates/PropertyCarousel";
import { LoginScreen } from "./templates/LoginScreen";
import { SellerInfo } from "./templates/SellerInfo";
import { NestedQna } from "./templates/NestedQna";
import type { NestedQnaSelection } from "./templates/NestedQna";
import { LocalityInfo, getClipboardTextForLocalityCarousel } from "./templates/LocalityInfo";
import { PriceTrend } from "./templates/PriceTrend";
import { DownloadBrochure, getClipboardTextForDownloadBrochure } from "./templates/DownloadBrochure";
import { ShareLocation } from "./templates/ShareLocation";
import { ShortlistProperty } from "./templates/ShortlistProperty";
import { ContactSeller } from "./templates/ContactSeller";
import { FeedbackRow } from "./FeedbackRow";

interface ChatMessageProps {
  event: ChatEventToUser & { messageId?: string };
  onUserAction: (event: ChatEventFromUser) => void;
  onCallNow?: () => void;
  actionsDisabled?: boolean;
  /** When false, transient templates (share_location, shortlist_property, contact_seller, nested_qna) are not rendered. */
  isLastMessage?: boolean;
}

const TEMPLATES = [
  "property_carousel",
  "locality_carousel",
  "download_brochure",
  "share_location",
  "shortlist_property",
  "contact_seller",
  "nested_qna",
] as const;

/** Only render when this message is the last in the chat; otherwise hide the template. */
const TRANSIENT_TEMPLATES: readonly string[] = [
  "share_location",
  "shortlist_property",
  "contact_seller",
  "nested_qna",
];

const FEEDBACK_ROW_BLACKLIST_TEMPLATES: readonly string[] = [
  "nested_qna",
  "shortlist_property",
  "contact_seller",
];

function isTemplateSupported(id: string): id is (typeof TEMPLATES)[number] {
  return TEMPLATES.includes(id as (typeof TEMPLATES)[number]);
}

// FeedbackRow extracted to its own component.

export function ChatMessage({
  event,
  onUserAction,
  actionsDisabled = false,
  isLastMessage = true,
}: ChatMessageProps) {
  const { sender, messageType, content } = event;
  const messageState = event.messageState;
  const isBot = sender.type === "bot";
  const isSystemOrBot = sender.type === "bot" || sender.type === "system";
  const isUser = sender.type === "user";

  // Never render analytics or context
  if (messageType === "analytics") return null;
  if (messageType === "context") return null;
  if (messageState === "CANCELLED_BY_USER") return null;
  if (messageState === "ERRORED_AT_ML" || messageState === "TIMED_OUT_BY_BE") {
    return (
      <div className="mb-2">
        <p className="text-sm text-[#0a0a0a] leading-[1.35]">Something went wrong. Please try again.</p>
      </div>
    );
  }

  // user_action: only render if visibility === "shown" and derivedLabel set
  if (messageType === "user_action") {
    if (event.visibility === "shown" && content.derivedLabel) {
      // System/bot "user_action" should be rendered like bot text (not as a user bubble).
      if (sender.type === "system" || sender.type === "bot") {
        return (
          <div className="mb-2">
            <p className="text-sm text-[#0a0a0a] leading-[1.35]">{content.derivedLabel}</p>
          </div>
        );
      }

      // Keep user bubbles for actual user sender, if any.
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

  // FeedbackRow is only eligible for bot/system messages.
  const showFeedbackBase = isSystemOrBot && event.messageState === "COMPLETED";

  // Bot text
  if (messageType === "text" && content.text) {
    return (
      <div className="mb-2">
        <p className="text-sm text-[#0a0a0a] leading-[1.35]">{content.text}</p>
        {showFeedbackBase && isLastMessage && (
          <FeedbackRow
            copyText={content.text}
            analyticsDimensions={{ template_id: "", message_type: messageType, sender: sender.type }}
          />
        )}
      </div>
    );
  }

  // Bot markdown — no bubble per design; plain content with .rich-text typography
  if (messageType === "markdown" && content.text) {
    return (
      <div className="mb-2">
        <RichText value={content.text} />
        {showFeedbackBase && isLastMessage && (
          <FeedbackRow
            copyText={content.text}
            analyticsDimensions={{ template_id: "", message_type: messageType, sender: sender.type }}
          />
        )}
      </div>
    );
  }

  // Bot template
  if (messageType === "template") {
    const templateId = content.templateId ?? "";
    const data = (content.data ?? {}) as Record<string, unknown>;
    let body: React.ReactNode = null;
    let templateClipboardText: string | undefined;

    if (isTemplateSupported(templateId)) {
      switch (templateId) {
        case "property_carousel":
          templateClipboardText = getClipboardTextForPropertyCarousel(data) ?? undefined;
          body = (
            <PropertyCarousel
              properties={(Array.isArray((data as any).properties) ? ((data as any).properties as any) : []) ?? []}
              messageId={event.messageId ?? ""}
              onUserAction={onUserAction}
              propertyCount={typeof (data as any).property_count === "number" ? (data as any).property_count : undefined}
              service={typeof (data as any).service === "string" ? (data as any).service : undefined}
              category={typeof (data as any).category === "string" ? (data as any).category : undefined}
              city={typeof (data as any).city === "string" ? (data as any).city : undefined}
              filters={typeof (data as any).filters === "object" && (data as any).filters !== null ? (data as any).filters : undefined}
              disabled={actionsDisabled}
            />
          );
          break;
        case "nested_qna": {
          const selections = (data as { selections?: NestedQnaSelection[] }).selections;
          if (!Array.isArray(selections) || selections.length === 0) break;
          body = (
            <NestedQna
              selections={selections}
              onComplete={(payloadData, derivedLabel) =>
                onUserAction({
                  sender: { type: "user" },
                  messageType: "user_action",
                  responseRequired: true,
                  visibility: "shown",
                  content: {
                    data: {
                      action: payloadData.action,
                      selections: payloadData.selections,
                      replyToMessageId: event.messageId,
                    },
                    derivedLabel,
                  },
                } as unknown as ChatEventFromUser)
              }
              disabled={actionsDisabled}
            />
          );
          break;
        }
        case "locality_carousel":
          templateClipboardText = getClipboardTextForLocalityCarousel(data) ?? undefined;
          body = (
            <LocalityInfo
              data={templateId === "locality_carousel" && data.localities != null ? { localities: data.localities } : data}
              onAction={({ action, responseRequired, visibility, derivedLabel, locality }) =>
                onUserAction({
                  sender: { type: "user" },
                  messageType: "user_action",
                  responseRequired,
                  visibility,
                  content: {
                    data: { action, replyToMessageId: event.messageId ?? "", locality },
                    derivedLabel,
                  },
                } as unknown as ChatEventFromUser)
              }
              disabled={actionsDisabled}
            />
          );
          break;
        
        case "download_brochure":
          templateClipboardText = getClipboardTextForDownloadBrochure(data) ?? undefined;
          body = <DownloadBrochure data={data} messageId={event.messageId ?? ""} onUserAction={onUserAction} disabled={actionsDisabled} />;
          break;
        case "share_location":
          body = (
            <ShareLocation
              data={data}
              onUserAction={onUserAction}
              disabled={actionsDisabled}
            />
          );
          break;
        case "shortlist_property":
          body = (
            <ShortlistProperty
              data={data}
              messageId={event.messageId ?? ""}
              onUserAction={onUserAction}
              disabled={actionsDisabled}
            />
          );
          break;
        case "contact_seller":
          body = (
            <ContactSeller
              data={data}
              messageId={event.messageId ?? ""}
              onUserAction={onUserAction}
              disabled={actionsDisabled}
            />
          );
          break;
        default:
          body = null;
      }
    } else {
      body = null;
    }

    if (body != null && TRANSIENT_TEMPLATES.includes(templateId) && !isLastMessage) {
      body = null;
    }

    const isTemplateRendered = body != null;
    const isBlacklisted = FEEDBACK_ROW_BLACKLIST_TEMPLATES.includes(templateId);
    const showTemplateFeedback =
      showFeedbackBase && isTemplateRendered && !isBlacklisted;

    return (
      <div className="mb-2">
        <div className="px-0">
          {body}
        </div>
        {showTemplateFeedback && (
          <FeedbackRow
            copyText={templateClipboardText}
            analyticsDimensions={{ template_id: templateId, message_type: messageType, sender: sender.type }}
          />
        )}
      </div>
    );
  }

  return null;
}
