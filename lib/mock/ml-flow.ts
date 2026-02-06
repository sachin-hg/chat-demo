import type { ChatEvent, ChatPayloadContent } from "@/lib/contract-types";
import {
  MOCK_PROPERTIES,
  MOCK_SELLERS,
  MOCK_LOCALITIES,
  SECTOR_OPTIONS,
  RENT_BUY_OPTIONS,
  MOCK_PRICE_TREND_SECTOR_32_GURGAON,
} from "./data";

const CONV = "conv_1";
const BOT = { type: "bot" as const, id: "re_bot" };

function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

function botMessage(
  messageId: string,
  messageType: "text" | "markdown" | "template",
  content: ChatPayloadContent,
  eventType: "message" | "info" = "message",
  actions?: ChatEvent["payload"]["actions"],
  visibility?: "shown" | "hidden"
): Omit<ChatEvent, "eventId" | "createdAt"> {
  return {
    conversationId: CONV,
    eventType,
    sender: BOT,
    payload: {
      messageId,
      messageType,
      visibility,
      content,
      ...(actions?.length ? { actions } : {}),
    },
  };
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

function matchText(text: string, ...options: string[]): boolean {
  const t = normalizeText(text);
  return options.some((o) => t.includes(normalizeText(o)) || normalizeText(o).includes(t));
}

/**
 * Given the latest user (or system) event and recent message history,
 * returns the next bot event(s) to append. Implements flow 4.1–4.18.
 */
export function getNextBotEvents(
  userEvent: ChatEvent,
  recentEvents: ChatEvent[]
): Omit<ChatEvent, "eventId" | "createdAt">[] {
  const { eventType, sender, payload } = userEvent;
  const messageType = payload.messageType;
  const content = payload.content;
  const data = content?.data as Record<string, unknown> | undefined;

  // Analytics: logged_in -> 4.7 shortlisted
  if (messageType === "analytics" && data?.action === "logged_in") {
    return [
      botMessage(generateMessageId(), "text", {
        text: "Logged in successfully",
      }, "info", undefined, "shown"),
      botMessage(generateMessageId(), "text", {
        text: "Shortlisted this property",
      }),
    ];
  }

  if (messageType === "user_action" && data?.actionId === "logged_in") {
    return [
      botMessage(generateMessageId(), "text", {
        text: "Logged in successfully",
      }, "info", undefined, "shown"),
      botMessage(generateMessageId(), "text", {
        text: "Shortlisted this property",
      }),
    ];
  }

  // User action: shortlist (msg_002) -> 4.6 login_screen
  if (messageType === "user_action" && data?.actionId === "shortlist") {
    return [
      botMessage(generateMessageId(), "template", {
        preText: "You need to login first.",
        templateId: "login_screen",
        data: {},
        fallbackText: "Please enter your phone number, so that I can send OTP for login",
      }),
    ];
  }

  // User action: contact (msg_002) -> 4.9 seller_info
  if (messageType === "user_action" && data?.actionId === "contact") {
    const propertyId = (data.propertyId as string) || "p1";
    const seller = MOCK_SELLERS.s1;
    const phone = seller?.phone || "+9198989898";
    const name = seller?.name || "Nadeem";
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          preText: `### Here are contact details of **${name}**`,
          templateId: "seller_info",
          data: {
            id: "s1",
            name,
            image: seller?.image || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
            phone,
          },
          fallbackText: `**Here are contact details of ${name}.** 📞 [Call ${phone}](tel:${phone.replace(/\s/g, "")})`,
        },
        "message",
        [{ id: "call_now", label: "Call Now", replyType: "hidden", scope: "message" }]
      ),
    ];
  }

  // User action: select pill (msg_007) -> 4.18 locality_info
  if (messageType === "user_action" && data?.selectedId) {
    const loc = MOCK_LOCALITIES[0];
    if (!loc) return [];
    const trendStr =
      loc.priceTrend >= 0
        ? `+${loc.priceTrend}% in last 1 year`
        : `${loc.priceTrend}% in last 1 year`;
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          preText: `### Here's all you need to know about ${loc.name.toLowerCase()} ${loc.city.toLowerCase()}`,
          templateId: "locality_info",
          data: {
            id: loc.id,
            name: loc.name,
            city: loc.city,
            image: loc.image,
            description: loc.description,
            highlights: loc.highlights,
            pros: loc.pros,
            cons: loc.cons,
            priceTrend: loc.priceTrend,
            priceTrendLabel: trendStr,
          },
          fallbackText: `**Here's all you need to know about ${loc.name} ${loc.city}.** ${loc.description} Few highlights: ${loc.highlights.join(", ")}. Pros: ${loc.pros.join(", ")}. Cons: ${loc.cons.join(", ")}. Price trend: ${trendStr}.`,
        },
        "message",
        [{ id: "show_reviews", label: "Show review", replyType: "visible", scope: "message" }]
      ),
    ];
  }

  // User text
  if (eventType !== "message" || messageType !== "text" || !content?.text) {
    return [];
  }
  const text = content.text;

  // First message / hi -> 4.3
  if (matchText(text, "hi", "hello", "hey")) {
    return [
      botMessage(generateMessageId(), "markdown", {
        text: "Hey! I see you're looking for **residential properties** to **buy**. How can I help?",
      }),
    ];
  }

  // show me properties -> 4.5
  if (matchText(text, "show me properties", "properties", "list")) {
    const properties = MOCK_PROPERTIES.map((p) => ({ id: p.id, title: p.title }));
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          preText: "### Properties you may like",
          templateId: "property_carousel",
          data: { properties },
          fallbackText: `**P1**: ${MOCK_PROPERTIES[0]?.title}  **P2**: ${MOCK_PROPERTIES[1]?.title}`,
          followUpText: "<i>Tap a card to take action</i>",
        },
        "message",
        [
          { id: "shortlist", label: "Shortlist", replyType: "visible", scope: "template_item" },
          { id: "contact", label: "Contact Seller", replyType: "visible", scope: "template_item" },
        ]
      ),
    ];
  }

  // Random query (seller address etc.) -> 4.12
  if (matchText(text, "where this seller lives", "seller lives", "address")) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "Can't help you with that, do you need anything else?",
      }),
    ];
  }

  // price trend (locality) -> price_trend template (not implemented in FE; fallback only)
  if (matchText(text, "price trend", "price trends") && matchText(text, "sector 32 gurgaon", "gurgaon", "32 gurgaon")) {
    const localityName = "Sector 32, Gurgaon";
    const rows = MOCK_PRICE_TREND_SECTOR_32_GURGAON.map(
      (r) => `| ${r.quarter} | ${r.changePercent >= 0 ? "↑" : "↓"} ${Math.abs(r.changePercent)}% |`
    ).join("\n");
    const fallbackText = `### Price trend — ${localityName}\n\n| Quarter | QoQ Change |\n| --- | --- |\n${rows}`;
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "price_trend",
        data: {
          localityId: "uuid1",
          localityName: "Sector 32",
          city: "Gurgaon",
          quarters: MOCK_PRICE_TREND_SECTOR_32_GURGAON,
        },
        fallbackText,
      }),
    ];
  }

  // sector 32 -> 4.14
  if (matchText(text, "sector 32", "sector 32?")) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          preText: "### Which sector 32 are you referring to?",
          templateId: "list_selection",
          data: { properties: SECTOR_OPTIONS },
          fallbackText: "**Which sector 32 are you referring to?**: sector 32 gurgaon or sector 32 faridabad",
          followUpText: "<i>Select a card to take action</i>",
        }
      ),
    ];
  }

  // faridabad (user types instead of selection) -> 4.16
  if (matchText(text, "faridabad")) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          preText: "### Are you looking for rent or buy? or don't care, and what generic info about locality?",
          templateId: "list_selection",
          data: { properties: RENT_BUY_OPTIONS },
          fallbackText: "**Are you looking for rent or buy? or don't care?**",
          followUpText: "<i>Select a card to take action</i>",
        }
      ),
    ];
  }

  // Default / unknown -> 4.12 style
  return [
    botMessage(generateMessageId(), "text", {
      text: "Can't help you with that, do you need anything else?",
    }),
  ];
}
