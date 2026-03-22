import type { ChatEvent, ChatPayloadContent, ChatEventToML, ChatEventFromML } from "@/lib/contract-types";
import {
  MOCK_PROPERTIES,
  MOCK_PROPERTY_CAROUSEL_CARDS,
  SECTOR_OPTIONS,
  SECTOR_21_OPTIONS,
  MOCK_LOCALITY_SECTOR_32_GURGAON,
  MOCK_LOCALITY_SECTOR_21_GURGAON,
  MOCK_PROPERTY_DETAILS_P2,
  MOCK_LOCALITY_LEARN_MORE_SECTOR_46,
  MOCK_LOCALITY_PRICE_TREND_SECTOR_86,
  MOCK_LOCALITY_RATING_REVIEW,
  MOCK_PROJECT_TRANSACTION_DETAILS,
} from "./data";

const CONV = "conv_1";
const BOT = { type: "bot" as const };
const ML_RESPONSE_CONTEXT = {
  service: "buy",
  category: "residential",
  city: "526acdc6c33455e9e4e9",
  filters: {
    poly: ["dce9290ec3fe8834a293"],
    est: 194298,
    region_entity_id: 31817,
    region_entity_type: "project",
    uuid: [],
    qv_resale_id: 1234,
    qv_rent_id: 12345,
    apartment_type_id: [1, 2],
    contact_person_id: [1, 2],
    facing: ["east", "west"],
    has_lift: true,
    is_gated_community: true,
    is_verified: true,
    max_area: 4000,
    max_poss: 0,
    max_price: 4800000,
    radius: 3000,
    routing_range: 10,
    routing_range_type: "time",
    min_price: 100,
    property_type_id: [1, 2],
    type: "project",
  },
};

function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

function botMessage(
  messageId: string,
  messageType: "text" | "markdown" | "template",
  content: ChatPayloadContent,
  options: {
    sourceMessageId: string;
    sequenceNumber?: number;
    messageState?: "IN_PROGRESS" | "COMPLETED" | "ERRORED_AT_ML";
    isVisible?: boolean;
  }
): ChatEventFromML & { messageId?: string } {
  const { sourceMessageId, sequenceNumber = 0, messageState = "COMPLETED", isVisible } = options;
  return {
    messageId,
    conversationId: CONV,
    sender: BOT,
    sourceMessageId,
    sequenceNumber,
    messageState,
    summarisedChatContext: ML_RESPONSE_CONTEXT,
    messageType,
    isVisible,
    content,
  };
}

// Contract: normalize action from content.data (contract uses "action", legacy uses "actionId")
function getAction(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const a = data.action ?? data.actionId;
  return typeof a === "string" ? a : undefined;
}

function getLocalityId(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const loc = data.locality;
  if (loc && typeof loc === "object" && loc !== null && "localityUuid" in loc) {
    return (loc as { localityUuid?: string }).localityUuid;
  }
  const id = data.localityUuid;
  return typeof id === "string" ? id : undefined;
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

function matchText(text: string, ...options: string[]): boolean {
  const t = normalizeText(text);
  return options.some((o) => t.includes(normalizeText(o)) || normalizeText(o).includes(t));
}

function matchWholeWord(text: string, ...words: string[]): boolean {
  const t = normalizeText(text);
  // Match as a standalone word (or the whole input), to avoid false positives like "t**hi**s".
  return words.some((w) => {
    const ww = normalizeText(w);
    if (!ww) return false;
    if (t === ww) return true;
    return new RegExp(`(^|\\s)${ww}(\\s|$)`, "i").test(t);
  });
}

function buildPropertyCarouselData(properties: typeof MOCK_PROPERTY_CAROUSEL_CARDS) {
  return {
    property_count: 15,
    service: "buy",
    category: "residential",
    city: "526acdc6c33455e9e4e9",
    filters: {
      poly: ["dce9290ec3fe8834a293"],
      est: 194298,
      region_entity_id: 31817,
      region_entity_type: "project",
      uuid: [],
      qv_resale_id: 1234,
      qv_rent_id: 12345,
      apartment_type_id: [1, 2],
      contact_person_id: [1, 2],
      facing: ["east", "west"],
      has_lift: true,
      is_gated_community: true,
      is_verified: true,
      max_area: 4000,
      max_poss: 0,
      max_price: 4800000,
      radius: 3000,
      routing_range: 10,
      routing_range_type: "time",
      min_price: 100,
      property_type_id: [1, 2],
      type: "project",
    },
    properties,
  };
}

export function getNextBotEvents(
  userEvent: ChatEventToML,
  recentEvents: ChatEvent[]
): (ChatEventFromML & { messageId?: string })[] {
  const messageType = userEvent.messageType;
  const content = userEvent.content;
  const data = content?.data as Record<string, unknown> | undefined;
  const sourceMessageId = userEvent.messageId;
  const action = getAction(data);
  const textMsg = content.text;

  if (!(messageType === "text" || userEvent.responseRequired)) {
    return [
     
    ];
  }

 
   
  if (messageType === "text" && (textMsg?.includes('contact seller'))) {
    const property = MOCK_PROPERTIES.find((x) => x.id === "p2") ?? MOCK_PROPERTIES[0];
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "contact_seller",
        data: {
          property,
        },
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Mock: locality carousel / comparison —————
  // If user explicitly mentions ambiguous sectors (e.g. "sector 32, sector 21"), we should route to nested_qna instead.
  if (
    messageType === "text" &&
    matchText(textMsg ?? "", "locality carousel", "locality comparison", "trending localities") &&
    !/(sector\s*32|sector\s*21)/i.test(textMsg ?? "")
  ) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "locality_carousel",
          data: {
            localities: [
              { ...MOCK_LOCALITY_SECTOR_32_GURGAON },
              { ...MOCK_LOCALITY_SECTOR_21_GURGAON },
            ],
          },
        },
        { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }
      ),
    ];
  }

  const locDta = MOCK_LOCALITY_LEARN_MORE_SECTOR_46;
    const mdLocDta = [
      `# ${locDta.name}: ${locDta.tagline}`,
      "",
      "---",
      "",
      `**Summary: ${locDta.summaryTitle}**`,
      ...locDta.highlights.map((h) => `- ${h}`),
      "",
      "---",
      "",
      locDta.followUpQuestion,
    ].join("\n");

  
  if (messageType === "user_action" && data?.action === "nested_qna_selection") {
    const selections = data.selections as { questionId: string; selection?: string; text?: string }[] | undefined;
    if (!Array.isArray(selections) || selections.length === 0) return [];
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, messageState: "IN_PROGRESS" }),
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" })
    ];
  }

  // ————— Contract §4.19 → §4.20: learn_more_about_property (markdown, design: property learn more.png) —————
  if (messageType === "user_action" && action === "learn_more_about_property") {
    const p = MOCK_PROPERTY_DETAILS_P2;
    const md = [
      `# ${p.title}`,
      `By ${p.builder}`,
      `📍 ${p.address}`,
      "",
      "",
      "---",
      "",
      "**Property Overview**",
      p.overview,
      "",
      "",
      "---",
      "",
      "**Configuration**",
      `Type: ${p.type}`,
      `Built-up Area: ${p.builtUpArea?.toLocaleString()} sq.ft.`,
      `Bedrooms: ${p.bedrooms} | Bathrooms: ${p.bathrooms} | Balconies: ${p.balconies}`,
      `Floor: ${p.floor}`,
      `Furnishing: ${p.furnishing}`,
      `${p.priceLabel}: ${p.priceValue}`,
      p.depositLabel && p.depositValue ? `${p.depositLabel}: ${p.depositValue}` : null,
      `Parking: ${p.parking}`,
      "",
      "",
      "---",
      "",
      "**Amenities**",
      p.amenities.join(", "),
      "",
      "",
      "---",
      "",
      "**Property Manager**",
      p.propertyManagerDesc,
      "",
    ].filter(Boolean).join("\n");
    return [
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  
  
  // ————— Contract §4.25: learn_more_about_locality (markdown, design: locality learn more.png) —————
  if (messageType === "user_action" && action === "learn_more_about_locality") {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.26 → §4.5: show_properties_in_locality —————
  if (messageType === "user_action" && action === "show_properties_in_locality") {
    const properties = MOCK_PROPERTY_CAROUSEL_CARDS.slice(0, 3);
    return [
      botMessage(
        generateMessageId(),
        "template",
        { templateId: "property_carousel", data: buildPropertyCarouselData(properties) },
        { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }
      ),
    ];
  }

  // ————— Contract §4.28: location_shared —————
  if (messageType === "user_action" && action === "location_shared") {
    const properties = MOCK_PROPERTY_CAROUSEL_CARDS.slice(0, 3);
    return [
      botMessage(generateMessageId(), "text", {
        text: "Here are properties near you.",
      }, { sourceMessageId, sequenceNumber: 0, messageState: "IN_PROGRESS" }),
      botMessage(
        generateMessageId(),
        "template",
        { templateId: "property_carousel", data: buildPropertyCarouselData(properties) },
        { sourceMessageId, sequenceNumber: 1, messageState: "COMPLETED" }
      ),
    ];
  }

  // ————— Contract §4.28.1: location_denied —————
  if (messageType === "user_action" && action === "location_denied") {
    return [
      botMessage(generateMessageId(), "text", {
        text: "No problem. You can search by area name or filters instead.",
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— User text —————
  if (messageType !== "text" || !content?.text) return [];
  const text = content.text;

  // ————— Contract §4.3: hi / hello —————
  if (matchWholeWord(text, "hi", "hello", "hey")) {
    return [
      botMessage(generateMessageId(), "markdown", {
        text: "Hey! I see you're looking for **residential properties** to **buy**. How can I help?",
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.3.1: non–real-estate intent (e.g. "tell me about modiji") —————
  if (
    matchText(text, "modiji", "tell me about modiji", "politics", "cricket", "weather") ||
    (matchText(text, "tell me about", "who is", "what is") && !matchText(text, "property", "locality", "sector", "area", "buy", "rent", "price", "trend"))
  ) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "Hey! I'm still learning. Wont be able to help you with this. Anything else?",
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.4 + §4.5: show me properties — intro text then carousel —————
  if (matchText(text, "show me properties", "properties", "show properties", "show me properties according to my preference")) {
    const properties = MOCK_PROPERTY_CAROUSEL_CARDS.slice(0, 3);
    return [
      botMessage(generateMessageId(), "text", {
        text: "Here are 2bhk properties in sector 32 gurgaon",
      }, { sourceMessageId, sequenceNumber: 0, messageState: "IN_PROGRESS" }),
      botMessage(
        generateMessageId(),
        "template",
        { templateId: "property_carousel", data: buildPropertyCarouselData(properties) },
        { sourceMessageId, sequenceNumber: 1, messageState: "COMPLETED" }
      ),
    ];
  }

  // ————— Contract §4.4 / §4.41: shortlist this property as well (text) —————
  if (matchText(text, "shortlist this property", "shortlist as well", "shortlist this", "shortlist")) {
    const property = MOCK_PROPERTIES.find((x) => x.id === "p2") ?? MOCK_PROPERTIES[0];
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "shortlist_property",
        data: { property },
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.11 → §4.12: random / off-topic query —————
  if (
    matchText(text, "where this seller lives", "seller lives", "address", "where does the seller live") ||
    matchText(text, "can you tell me where", "where this", "seller address")
  ) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "Cant help you with that, do you need anything else?",
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.13 → §4.13.1 + §4.14: sector 32, sector 21 — nested_qna (contract shape: selections[]) —————
  if (matchText(text, "sector 32", "sector 21") && (text.includes("32") && text.includes("21") || text.includes("sector 32, sector 21"))) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "I could only match 1 out of 2 areas you mentioned?",
      }, { sourceMessageId, sequenceNumber: 0, messageState: "IN_PROGRESS" }),
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "nested_qna",
          data: {
            selections: [
              {
                questionId: "sub_intent_1",
                title: "Which sector 32 are you referring to?",
                type: "locality_single_select",
                options: SECTOR_OPTIONS.map((o) => ({ id: o.id, title: o.name, city: o.city, type: o.type })),
              },
              {
                questionId: "sub_intent_2",
                title: "Which sector 21 are you referring to?",
                type: "locality_single_select",
                entity: "sector 21",
                options: SECTOR_21_OPTIONS.map((o) => ({ id: o.id, title: o.name, city: o.city, type: o.type })),
              },
            ],
          },
        },
        { sourceMessageId, sequenceNumber: 1, messageState: "COMPLETED" }
      ),
    ];
  }
  // ————— Sector 32 only: "which sector 32" / "learn more about sector 32" —————
  if (
    (matchText(text, "learn more about sector 32", "tell more about sector 32") &&
     !text.toLowerCase().includes("sector 21"))
  ) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "nested_qna",
          data: {
            selections: [
              {
                questionId: "sub_intent_1",
                title: "Which sector 32 are you referring to?",
                type: "locality_single_select",
                options: SECTOR_OPTIONS.map((o) => ({ id: o.id, title: o.name, city: o.city, type: o.type })),
              },
            ],
          },
        },
        { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }
      ),
    ];
  }
  // ————— Contract §4.13 → §4.13.1 + §4.14: sector 21 only — nested_qna —————
  if (text.includes("sector 21")) {
    return [
      botMessage(
        generateMessageId(),
        "template",
        {
          templateId: "nested_qna",
          data: {
            selections: [
              
              {
                questionId: "sub_intent_2",
                title: "Which sector 21 are you referring to?",
                type: "locality_single_select",
                entity: "sector 21",
                options: SECTOR_21_OPTIONS.map((o) => ({ id: o.id, title: o.name, city: o.city, type: o.type })),
              },
            ],
          },
        },
        { sourceMessageId, sequenceNumber: 1, messageState: "COMPLETED" }
      ),
    ];
  }

  // ————— Sector 21 only —————
  if (matchText(text, "locality info", "locality detail?", "more about locality")) {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.17 → §4.18: "buy" or "rent" → locality_info —————
  if (matchText(text, "buy") && text.length <= 5) {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }
  if (matchText(text, "rent") && text.length <= 5) {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Locality price trend (markdown, design: locality price trend.png) — Sector 86 or generic —————
  if (matchText(text, "price trend", "price trends")) {
    const pt = MOCK_LOCALITY_PRICE_TREND_SECTOR_86;
    const qList = pt.quarterlyTrends.map((q) => `- ${q.quarter} – ${q.pricePerSqft} / sq ft`).join("\n");
    const md = [
      `# Price Trends for ${pt.localityName}`,
      "",
      "---",
      "",
      "## Average Price",
      "",
      `${pt.averagePricePerSqft} / sq ft`,
      "",
      "## 1-Year Growth",
      "",
      `${pt.oneYearGrowthPercent >= 0 ? "" : "-"}${Math.abs(pt.oneYearGrowthPercent).toFixed(2)}%`,
      "",
      "## Available Properties",
      "",
      `${pt.availableProperties}`,
      "",
      "---",
      "",
      "## Price Range",
      "",
      `- Minimum – ${pt.minPricePerSqft} / sq ft`,
      `- Maximum – ${pt.maxPricePerSqft} / sq ft`,
      "",
      "---",
      "",
      "## 2025 Quarterly Trends",
      "",
      qList,
      "",
      "---",
      "",
      "## Latest Update",
      "",
      `${pt.latestUpdate.period} – ${pt.latestUpdate.pricePerSqft} / sq ft`,
      "",
      "---",
      "",
      pt.footerText ?? "",
    ].filter(Boolean).join("\n");
    return [
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Locality rating review (markdown, design: locality rating review.png) —————
  if (matchText(text, "reviews", "rating review", "locality reviews", "show reviews", "ratings and reviews")) {
    const r = MOCK_LOCALITY_RATING_REVIEW;
    const distList = r.distribution.map((d) => `- ${d.stars}-star – ${d.count} reviews (${d.percentage}%)`).join("\n");
    const catList = r.categoryBreakdown.map((c) => `${c.categoryName} – ${c.rating.toFixed(2)} / ${c.maxRating.toFixed(1)}`).join("\n");
    const md = [
      `# Locality Ratings & Reviews${r.localityName ? ` — ${r.localityName}` : ""}`,
      "",
      "---",
      "",
      "## Overall Rating",
      `⭐ **${r.overallRating.toFixed(2)} / ${r.maxRating.toFixed(1)}**`,
      `Based on ${r.reviewCount} reviews`,
      "",
      "---",
      "",
      "## Rating Distribution",
      distList,
      "",
      "---",
      "",
      "## Category Breakdown",
      "",
      catList,
      "",
      "---",
      "",
      "## Key Insights",
      "",
      "### Top strengths",
      ...r.topStrengths.map((s) => `- ${s}`),
      "",
      "### Areas to consider",
      "",
      ...r.areasToConsider.map((a) => `- ${a}`),
      "",
      "---",
      "",
      r.footerText ?? "",
    ].filter(Boolean).join("\n");
    return [
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Project transaction details (markdown, design: project transaction details.png) —————
  if (matchText(text, "transaction details", "project transaction", "transaction data", "godrej gold county")) {
    const t = MOCK_PROJECT_TRANSACTION_DETAILS;
    const txList = t.latestTransactions.map((x) => `- ${x.unitId} – ${x.detail} | ${x.date}`).join("\n");
    const md = [
      "# Transaction Data Analysis",
      "",
      "---",
      "",
      "## Project Details",
      "",
      `Name: ${t.projectName}`,
      `Location: ${t.location}`,
      `Total Transactions: ${t.totalTransactions}`,
      "",
      "---",
      "",
      "## Transaction Breakdown",
      "",
      `Sales: ${t.sales} | Mortgages: ${t.mortgages}`,
      "",
      "---",
      "",
      "## Area Statistics",
      "",
      `Average Area: ${t.averageAreaSqft.toLocaleString(undefined, { minimumFractionDigits: 1 })} sq ft`,
      `Size Range: ${t.sizeRangeMin.toLocaleString(undefined, { minimumFractionDigits: 1 })} – ${t.sizeRangeMax.toLocaleString(undefined, { minimumFractionDigits: 1 })} sq ft`,
      "",
      "---",
      "",
      "## Recent Activity (Last 6 Months)",
      "",
      `Active Transactions: ${t.activeTransactionsLast6Months} | Recent Mortgages: ${t.recentMortgagesLast6Months}`,
      "",
      "---",
      "",
      "## Latest Transactions",
      "",
      txList,
      "",
      "---",
      "",
      "## Market Insights",
      "",
      `Leased Properties: ${t.leasedCount} (${t.leasedPercentage}%)`,
      `Market Activity: ${t.marketActivity}`,
      "",
      "---",
      t.footerText ?? "",
      t.ctaText ?? "",
    ].filter(Boolean).join("\n");
    return [
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }


  // ————— Contract §4.21 → §4.22: brochure —————
  if (matchText(text, "brochure", "show me the brochure", "brochure of this property")) {
    const p = MOCK_PROPERTIES.find((x) => x.id === "p1") ?? MOCK_PROPERTIES[0];
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "download_brochure",
        data: {
          property: p,
        },
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.27: show me properties around me → share_location —————
  // Frontend ShareLocation template checks if permission already exists and auto-sends location_shared; ML then responds with property carousel.
  if (matchText(text, "properties around me", "around me", "near me", "show me properties near", "3bhk properties near me")) {
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "share_location",
        data: {},
      }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
    ];
  }

  // ————— Default —————
  return [
    botMessage(generateMessageId(), "text", {
      text: "I can help you find properties! Try asking me to 'show me properties' or ask about localities.",
    }, { sourceMessageId, sequenceNumber: 0, messageState: "COMPLETED" }),
  ];
}
