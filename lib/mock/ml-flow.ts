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
  options: {
    sourceMessageId?: string;
    sequenceNumber?: number;
    isFinal?: boolean;
    actions?: ChatEvent["payload"]["actions"];
    visibility?: "shown" | "hidden";
  } = {}
): Omit<ChatEvent, "eventId" | "createdAt"> {
  const { sourceMessageId, sequenceNumber = 0, isFinal = true, actions, visibility } = options;
  return {
    conversationId: CONV,
    sender: BOT,
    payload: {
      messageId,
      sourceMessageId,
      sequenceNumber,
      isFinal,
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

export function getNextBotEvents(
  userEvent: ChatEvent,
  recentEvents: ChatEvent[]
): Omit<ChatEvent, "eventId" | "createdAt">[] {
  const { payload } = userEvent;
  const messageType = payload.messageType;
  const content = payload.content;
  const data = content?.data as Record<string, unknown> | undefined;
  const sourceMessageId = payload.messageId;

  // user_action: logged_in
  if (
    (messageType === "analytics" && data?.action === "logged_in") ||
    (messageType === "user_action" && data?.actionId === "logged_in")
  ) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "You have been logged in",
      }, { sourceMessageId, sequenceNumber: 0, isFinal: false }),
      botMessage(generateMessageId(), "text", {
        text: "Shortlisted this property for you!",
      }, { sourceMessageId, sequenceNumber: 1, isFinal: true }),
    ];
  }

  // user_action: shortlist -> login_screen
  if (messageType === "user_action" && data?.actionId === "shortlist") {
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "login_screen",
        data: {},
        fallbackText: "Please enter your phone number to login and shortlist this property.",
      }, { sourceMessageId, sequenceNumber: 0, isFinal: true }),
    ];
  }

  // user_action: contact -> seller_info + confirmation
  if (messageType === "user_action" && data?.actionId === "contact") {
    const seller = MOCK_SELLERS.s1;
    const phone = seller?.phone || "+91 98989 89898";
    const name = seller?.name || "Nadeem";
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "seller_info",
          data: {
            id: "s1",
            name,
            image: seller?.image || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
            phone,
          },
          fallbackText: `**Here are contact details of ${name}.** 📞 [Call ${phone}](tel:${phone.replace(/\s/g, "")})`,
        },
        {
          sourceMessageId,
          sequenceNumber: 0,
          isFinal: false,
          actions: [{ id: "call_now", label: "Call Now", replyType: "hidden", scope: "message" }],
        }
      ),
      botMessage(generateMessageId(), "text", {
        text: "The property owner has been contacted, someone will reach out to you soon!",
      }, { sourceMessageId, sequenceNumber: 1, isFinal: true }),
    ];
  }

  // user_action: select pill from list_selection
  if (messageType === "user_action" && data?.selectedId) {
    const loc = MOCK_LOCALITIES[0];
    if (!loc) return [];
    const trendStr = loc.priceTrend >= 0
      ? `+${loc.priceTrend}% YoY`
      : `${loc.priceTrend}% YoY`;
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "locality_info",
          data: {
            localities: [
              {
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
                rating: loc.rating,
              },
            ],
          },
          fallbackText: `**${loc.name}, ${loc.city}** — ${loc.description} Price trend: ${trendStr}.`,
        },
        {
          sourceMessageId,
          sequenceNumber: 0,
          isFinal: true,
          actions: [{ id: "show_reviews", label: "Show review", replyType: "visible", scope: "message" }],
        }
      ),
    ];
  }

  // User text
  if (messageType !== "text" || !content?.text) return [];
  const text = content.text;

  // hi/hello
  if (matchText(text, "hi", "hello", "hey")) {
    return [
      botMessage(generateMessageId(), "markdown", {
        text: "Hey! I see you're looking for **residential properties** to **buy**. How can I help?",
      }, { sourceMessageId, sequenceNumber: 0, isFinal: true }),
    ];
  }

  // show properties
  if (matchText(text, "show me properties", "properties", "list", "show properties")) {
    const properties = MOCK_PROPERTIES.slice(0, 2).map((p) => ({
      id: p.id,
      title: p.title,
      projectName: p.projectName,
      tags: p.tags,
      image: p.image,
      priceFormatted: p.priceFormatted,
      builtUpArea: p.builtUpArea,
      locationFormatted: p.locationFormatted,
    }));
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "property_carousel",
          data: { properties },
          fallbackText: `**${MOCK_PROPERTIES[0]?.title}** — ${MOCK_PROPERTIES[0]?.priceFormatted}, ${MOCK_PROPERTIES[0]?.locationFormatted}`,
        },
        {
          sourceMessageId,
          sequenceNumber: 0,
          isFinal: true,
          actions: [
            { id: "shortlist", label: "Shortlist", replyType: "visible", scope: "template_item" },
            { id: "contact", label: "Contact Seller", replyType: "visible", scope: "template_item" },
          ],
        }
      ),
    ];
  }

  // random query
  if (matchText(text, "where this seller lives", "seller lives", "address")) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "Can't help you with that, do you need anything else?",
      }, { sourceMessageId, sequenceNumber: 0, isFinal: true }),
    ];
  }

  // price trend
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
      }, { sourceMessageId, sequenceNumber: 0, isFinal: true }),
    ];
  }

  // sector 32
  if (matchText(text, "sector 32", "sector 32?")) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "list_selection",
          data: {
            title: "Did you mean one of these?",
            items: SECTOR_OPTIONS,
            canSkip: true,
          },
          fallbackText: "Which Sector 32 are you referring to? Gurgaon or Faridabad?",
        },
        { sourceMessageId, sequenceNumber: 0, isFinal: true }
      ),
    ];
  }

  // faridabad
  if (matchText(text, "faridabad")) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "list_selection",
          data: {
            title: "Are you looking to rent or buy?",
            items: RENT_BUY_OPTIONS,
            canSkip: false,
          },
          fallbackText: "Are you looking for rent or buy?",
        },
        { sourceMessageId, sequenceNumber: 0, isFinal: true }
      ),
    ];
  }

  // localities / trending
  if (matchText(text, "localities", "locality", "trending", "top localities")) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "locality_info",
          data: {
            localities: MOCK_LOCALITIES.map((loc) => ({
              ...loc,
              priceTrendLabel: loc.priceTrend >= 0 ? `+${loc.priceTrend}% YoY` : `${loc.priceTrend}% YoY`,
            })),
          },
          fallbackText: `Top localities: ${MOCK_LOCALITIES.map(l => l.name).join(", ")}`,
        },
        { sourceMessageId, sequenceNumber: 0, isFinal: true }
      ),
    ];
  }

  // Default
  return [
    botMessage(generateMessageId(), "text", {
      text: "I can help you find properties! Try asking me to 'show me properties' or ask about localities.",
    }, { sourceMessageId, sequenceNumber: 0, isFinal: true }),
  ];
}
