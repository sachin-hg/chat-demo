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

function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

function botMessage(
  messageId: string,
  messageType: "text" | "markdown" | "template" | "context",
  content: ChatPayloadContent,
  options: {
    sourceMessageId: string;
    sequenceNumber?: number;
    sourceMessageState?: "IN_PROGRESS" | "COMPLETED" | "ERRORED_AT_ML";
    isVisible?: boolean;
  }
): ChatEventFromML & { messageId?: string } {
  const { sourceMessageId, sequenceNumber = 0, sourceMessageState = "COMPLETED", isVisible } = options;
  return {
    messageId,
    conversationId: CONV,
    sender: BOT,
    sourceMessageId,
    sequenceNumber,
    sourceMessageState,
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

/**
 * Split bot text/markdown into phrases for v1.1 SSE `message_delta` streaming (mock).
 * Uses paragraph → sentence boundaries, then word groups for very long segments.
 */
export function splitTextIntoStreamPhrases(text: string): string[] {
  const t = text.trim();
  if (!t) return [];

  const MAX_SENTENCE = 140;
  const WORD_GROUP = 8;

  const wordGroups = (s: string): string[] => {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const out: string[] = [];
    for (let i = 0; i < words.length; i += WORD_GROUP) {
      out.push(words.slice(i, i + WORD_GROUP).join(" "));
    }
    return out;
  };

  const splitSentences = (paragraph: string): string[] => {
    const p = paragraph.trim();
    if (!p) return [];
    // Split on . ! ? followed by space or end (keep delimiter on chunk)
    const raw = p.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    // Single run-on line: long char-wise → word groups; medium with many words → phrase groups for demo UX
    if (raw.length === 1) {
      const only = raw[0];
      if (only.length > MAX_SENTENCE) return wordGroups(only);
      const wc = only.split(/\s+/).filter(Boolean).length;
      if (wc > 10) return wordGroups(only);
    }
    const acc: string[] = [];
    for (const s of raw) {
      if (s.length > MAX_SENTENCE) {
        acc.push(...wordGroups(s));
      } else {
        acc.push(s);
      }
    }
    return acc;
  };

  const paragraphs = t.split(/\n\n+/);
  const out: string[] = [];
  for (const para of paragraphs) {
    const lines = para.split(/\n/);
    for (const line of lines) {
      out.push(...splitSentences(line));
    }
  }

  return out.length > 0 ? out : [t];
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

/** ML context-out (Option 3): same `content.data` shape as FE system context on open; encodes narrowed locality intent. */
function mlContextDataForLocality(variant: "sector_32_gurgaon" | "sector_21_gurgaon"): Record<string, unknown> {
  const poly =
    variant === "sector_32_gurgaon"
      ? ["dce9290ec3fe8834a293"]
      : ["a1b2c3d4e5f6sector21gurgaonpoly"];
  return {
    user_intent: "SRP",
    service: "buy",
    category: "residential",
    city: "526acdc6c33455e9e4e9",
    poly,
    est: 194298,
    properties: [{ id: 123, type: "project" }],
    uuid: [],
    filters: {
      apartment_type_id: [1, 2],
      max_price: 4800000,
      min_price: 100,
      property_type_id: [1, 2],
      type: "project",
    },
  };
}

function buildPropertyCarouselData(properties: typeof MOCK_PROPERTY_CAROUSEL_CARDS) {
  // Align shape with production `sample_conversation.json` (SRP context + filters + pagination + properties).
  const prodProperties = properties.map((p) => {
    // Keep the production keys, but add extra fields the UI expects (`_id`, and `area_value_in_unit`).
    const base: Record<string, unknown> = {
      _id: p._id,
      id: p.id,
      type: p.type,
      title: p.title,
      ...(p.type === "project" ? { name: p.name } : {}),
      short_address: (p.short_address ?? []).map((x) => ({
        polygon_uuid: "",
        display_name: x.display_name,
      })),
      thumb_image_url: p.thumb_image_url,
      inventory_canonical_url: p.inventory_canonical_url,
      property_tags: p.property_tags ?? [],
      ...(p.type === "project" ? { is_rera_verified: p.is_rera_verified } : { is_verified: p.is_verified }),
      // Common price fields (present in sample payloads across types).
      formatted_min_price: p.formatted_min_price,
      formatted_max_price: p.formatted_max_price,
      formatted_price: p.formatted_price,
      // Production-style extras (optional in UI, but present in sample JSON).
      price_on_request: p.price_on_request ?? false,
      current_status: p.current_status ?? null,
      possession_date: p.possession_date ?? null,
      unit_of_area: p.unit_of_area,
      display_area_type: p.display_area_type,
      min_selected_area_in_unit: p.min_selected_area_in_unit,
      max_selected_area_in_unit: p.max_selected_area_in_unit,
      region_entities: p.region_entities ?? null,
    };

    if (p.type === "project") {
      // Enrich to look like sample_conversation.json (project) – include a rich inventory_configs row.
      return {
        ...base,
        // Sample-like tower/building entities (used by some project payloads).
        region_entities: [
          { name: "Tower-D", id: "365412", type: "np_building" },
          { name: "Tower-I", id: "365417", type: "np_building" },
          { name: "Tower-G", id: "365415", type: "np_building" },
          { name: "Tower-H", id: "365416", type: "np_building" },
          { name: "Tower-C", id: "365411", type: "np_building" },
          { name: "Tower-A", id: "365409", type: "np_building" },
          { name: "Tower-B", id: "365410", type: "np_building" },
          { name: "Tower-E", id: "365413", type: "np_building" },
          { name: "Tower-F", id: "365414", type: "np_building" },
        ],
        inventory_configs: [
          {
            formatted_price: p.formatted_min_price ?? p.formatted_price ?? "",
            seller: [1],
            per_unit_rate: 7500,
            listing_id: "2a1f04ad61d9b72be76a",
            formatted_per_unit_rate: "7.5k",
            facing: "all",
            area_value_in_unit: p.min_selected_area_in_unit ?? 1725,
            flat_config_id: 352206,
            property_type_id: 1,
            coupon_details: [],
            price: 12937500,
            formatted_per_sqft_rate: "7.5k",
            seller_uuid: "634be935-1b63-4fe4-9a27-0d1728d12f25",
            price_on_request: false,
            area_information: [
              {
                value_in_unit: p.min_selected_area_in_unit ?? 1725,
                name: p.display_area_type ?? "Super Builtup Area",
                double_value_in_unit: p.min_selected_area_in_unit ?? 1725,
                value: p.min_selected_area_in_unit ?? 1725,
                double_value: p.min_selected_area_in_unit ?? 1725,
              },
            ],
            property_type: "Apartment",
            id: Number(p.id) || 107997,
            number_of_toilets: null,
            apartment_group_name: "3 BHK",
            selected_area_in_unit: p.min_selected_area_in_unit ?? 1725,
            area: p.min_selected_area_in_unit ?? 1725,
            brokerage: 0,
            number_of_bedrooms: 3,
            derived_per_sqft_rate: 7500,
            pass_by_filter: true,
            apartment_type_id: 4,
            loan_amount: 10350000,
            is_available: true,
            derived_price: 12937500,
            per_sqft_rate: 7500,
            emi_amount: 72369,
            inventory_count: 0,
            floor_plan_urls: [],
            selected_area: p.min_selected_area_in_unit ?? 1725,
            completion_date: 1559347200,
            formatted_selected_area_in_unit: "1.725 K",
          },
        ],
      };
    }

    if (p.type === "resale") {
      // Enrich to look like sample_conversation.json (resale) – include resale-specific fields.
      return {
        ...base,
        // Some resale rows in production can still be RERA verified (see sample_conversation.json).
        is_rera_verified: p.is_rera_verified ?? true,
        price_on_request: p.price_on_request ?? false,
        // Sample-like region entity linking back to a project (optional, but present in sample payloads).
        region_entities: [
          {
            inventory_canonical_url:
              "/in/buy/projects/page/103934-ramprastha-the-view-by-ramprastha-promoters-developers-private-ltd-in-sector-37d",
            is_rera_verified: true,
            duplicate_project_id: "null",
            latitude: 28.447289,
            initiation_date: 1243794600,
            type: "project",
            has_transaction: false,
            review_rating: 3.8,
            entity_url:
              "/in/buy/projects/page/103934-ramprastha-the-view-by-ramprastha-promoters-developers-private-ltd-in-sector-37d",
            is_post_rera: true,
            name: "Ramprastha The View",
            paid: false,
            show_project_name: true,
            completion_date: 1446336000,
            id: "103934",
            status: "ACTIVE",
            longitude: 76.970375,
          },
        ],
        inventory_configs: [
          {
            seller: [2],
            area_in_sq_ft: p.inventory_configs?.[0]?.area_value_in_unit ?? 468,
            formatted_per_unit_rate: "9.62k",
            is_parking_chargeable: null,
            is_painting_chargeable: null,
            is_rent_maintenance_chargeable: null,
            open_parking_count: 1,
            is_security_deposit_chargeable: true,
            area_value_in_unit: p.inventory_configs?.[0]?.area_value_in_unit ?? 468,
            property_type_id: 2,
            property_category_id: 1,
            flat_config_id: Number(p.id) || 17816947,
            furnish_type_id: p.inventory_configs?.[0]?.furnish_type_id ?? 2,
            lock_in_period: null,
            price: 4500000,
            formatted_per_sqft_rate: "9.62k",
            is_brokerage_chargeable: null,
            parking_charges: null,
            pitch: "Demo: resale inventory config payload (sample-like).",
            id: Number(p.id) || 17816947,
            area: p.inventory_configs?.[0]?.area_value_in_unit ?? 468,
            is_brokerage_negotiable: null,
            brokerage: 0,
            number_of_bedrooms:
              typeof (p as any)?.inventory_configs?.[0]?.number_of_bedrooms === "number"
                ? (p as any).inventory_configs[0].number_of_bedrooms
                : 3,
            derived_per_sqft_rate: 9427,
            maintenance_charges_rent: null,
            apartment_type_id: 4,
            parking_count: 2,
            derived_price: 4500000,
            apartment_type: "3 BHK",
            seat_count: null,
            per_sqft_rate: 9427,
            cabin_count: null,
            formatted_price: p.formatted_price ?? p.formatted_min_price ?? "45.0 L",
            formatted_per_sq_unit_area_rate: "9.43k",
            per_unit_rate: 9427,
            facing: "north-east",
            actual_property_type_id: 1,
            property_category: "residential",
            property_category_type_mapping_id: "1",
            property_type: "Apartment",
            price_on_request: false,
            covered_parking_count: 1,
            number_of_toilets: 3,
            security_deposit: 0,
            is_lock_in_period_chargeable: null,
            maintenance_charges_buy: 5000,
            is_available: true,
            carpet_area: 1385,
            total_balcony_count: 3,
            completion_date: 1461664225,
            per_sq_unit_area_rate: 9427,
            painting_charges: null,
          },
        ],
      };
    }

    // Rent: keep minimal; UI already supports it.
    return {
      ...base,
      inventory_configs: (p.inventory_configs ?? []).map((ic) => ({
        furnish_type_id: ic.furnish_type_id ?? null,
        area_in_sq_ft: ic.area_value_in_unit ?? null,
        area_value_in_unit: ic.area_value_in_unit ?? null,
        price_on_request: null,
      })),
    };
  });

  return {
    user_intent: "SRP",
    service: "buy",
    category: "residential",
    city: {
      city_name: "Gurgaon",
      display_name: "Gurgaon",
      city_uuid: "3c69d8421a77f8f8b611",
      bbx_uuid: "526acdc6c33455e9e4e9",
      id: "526acdc6c33455e9e4e9",
    },
    entities: [
      {
        id: "f745c4c0226869fa87b8",
        name: "sector 37d",
        display_name: "Sector 37D, Gurgaon",
        uuid: "f745c4c0226869fa87b8",
        lon_lat: [76.97277802321182, 28.445236369097103],
        city: "Gurgaon",
        type: "locality",
      },
       {
        id: "2342342",
        name: "DLF privana",
        display_name: "DLF Privana, Gurgaon",
        uuid: "2342342",
        lon_lat: [76.97277802321182, 28.445236369097103],
        city: "Gurgaon",
        type: "project",
      },
      {
        id: "2342342",
        name: "DLF",
        display_name: "DLF",
        uuid: "ergefgd-f34534dfdfgd-dfgdfg-dfgdf",
        lon_lat: null,
        city: null,
        type: "developer",
      }
    ],
    pagination: {
      p: 2,
      results_per_page: 10,
      is_last_page: false,
      cursor: "-1977752683",
      resale_total_count: 394,
      np_total_count: 35,
    },
    filters: {
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
    properties: prodProperties,
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
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
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
        { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }
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
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "IN_PROGRESS" }),
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" })
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
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }

  
  
  // ————— Contract §4.25: learn_more_about_locality (markdown, design: locality learn more.png) —————
  if (messageType === "user_action" && action === "learn_more_about_locality") {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
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
        { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }
      ),
    ];
  }

  // ————— Contract §4.28: location_shared —————
  if (messageType === "user_action" && action === "location_shared") {
    const properties = MOCK_PROPERTY_CAROUSEL_CARDS.slice(0, 3);
    return [
      botMessage(generateMessageId(), "text", {
        text: "Here are properties near you.",
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "IN_PROGRESS" }),
      botMessage(
        generateMessageId(),
        "template",
        { templateId: "property_carousel", data: buildPropertyCarouselData(properties) },
        { sourceMessageId, sequenceNumber: 1, sourceMessageState: "COMPLETED" }
      ),
    ];
  }

  // ————— Contract §4.28.1: location_denied / location_not_available —————
  if (
    messageType === "user_action" &&
    (action === "location_denied" || action === "location_not_available")
  ) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "No problem. You can search by area name or filters instead.",
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
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
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.3.1: non–real-estate intent (e.g. "tell me about modiji") —————
  if (
    matchText(text, "modiji", "tell me about modiji", "politics", "cricket", "weather") ||
    (matchText(text, "tell me about", "who is", "what is") && !matchText(text, "property", "locality", "sector", "area", "buy", "rent", "price", "trend"))
  ) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "That's a bit outside my lane 😅\nI'm here to help with home search and locality insights.",
        data: { guard_blocked_by: "llm", guard_category: "out_of_scope" },
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.4 + §4.5: show me properties — intro text then carousel —————
  if (matchText(text, "show me properties", "properties", "show properties", "show me properties according to my preference")) {
    const properties = MOCK_PROPERTY_CAROUSEL_CARDS.slice(0, 3);
    return [
      botMessage(generateMessageId(), "text", {
        text: "Here are 2bhk properties in sector 32 gurgaon",
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "IN_PROGRESS" }),
      botMessage(
        generateMessageId(),
        "template",
        { templateId: "property_carousel", data: buildPropertyCarouselData(properties) },
        { sourceMessageId, sequenceNumber: 1, sourceMessageState: "COMPLETED" }
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
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
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
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.13 → §4.13.1 + §4.14: sector 32, sector 21 — nested_qna (contract shape: selections[]) —————
  if (matchText(text, "sector 32", "sector 21") && (text.includes("32") && text.includes("21") || text.includes("sector 32, sector 21"))) {
    return [
      botMessage(generateMessageId(), "text", {
        text: "I could only match 1 out of 2 areas you mentioned?",
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "IN_PROGRESS" }),
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
                options: SECTOR_21_OPTIONS.map((o) => ({ id: o.id, title: o.name, attributes: [o.type, o.city] })),
              },
            ],
          },
        },
        { sourceMessageId, sequenceNumber: 1, sourceMessageState: "COMPLETED" }
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
        "context",
        { data: mlContextDataForLocality("sector_32_gurgaon") },
        { sourceMessageId, sequenceNumber: 0, sourceMessageState: "IN_PROGRESS" }
      ),
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
        { sourceMessageId, sequenceNumber: 1, sourceMessageState: "COMPLETED" }
      ),
    ];
  }
  // ————— Contract §4.13 → §4.13.1 + §4.14: sector 21 only — nested_qna —————
  if (text.includes("sector 21")) {
    return [
      botMessage(
        generateMessageId(),
        "context",
        { data: mlContextDataForLocality("sector_21_gurgaon") },
        { sourceMessageId, sequenceNumber: 0, sourceMessageState: "IN_PROGRESS" }
      ),
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
        { sourceMessageId, sequenceNumber: 1, sourceMessageState: "COMPLETED" }
      ),
    ];
  }

  // ————— Sector 21 only —————
  if (matchText(text, "locality info", "locality detail?", "more about locality")) {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.17 → §4.18: "buy" or "rent" → locality_info —————
  if (matchText(text, "buy") && text.length <= 5) {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }
  if (matchText(text, "rent") && text.length <= 5) {
    return [
      botMessage(generateMessageId(), "markdown", { text: mdLocDta }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
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
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
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
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
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
      botMessage(generateMessageId(), "markdown", { text: md }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }


  // ————— Contract §4.21 → §4.22: brochure —————
  if (matchText(text, "brochure", "show me the brochure", "brochure of this property")) {
    const p = MOCK_PROPERTIES.find((x) => x.id === "p1") ?? MOCK_PROPERTIES[0];
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "download_brochure",
        data: {
          // Production-like `download_brochure` payload (sample_conversation.json).
          _id: p._id,
          id: p.id,
          type: p.type,
          title: "3 BHK Apartment",
          name: p.name ?? "Ramprastha Skyz",
          short_address: (p.short_address ?? []).map((x) => ({
            display_name: x.display_name,
            polygon_uuid: "",
          })),
          cover_photo_url: p.thumb_image_url,
          inventory_canonical_url: p.inventory_canonical_url,
          property_tags: p.property_tags ?? ["Ready to Move", "Project", "RERA Approved"],
          is_rera_verified: p.is_rera_verified ?? true,
          formatted_min_price: p.formatted_min_price ?? "1.29 Cr",
          formatted_max_price: p.formatted_max_price ?? "1.52 Cr",
          price_on_request: p.price_on_request ?? false,
          unit_of_area: p.unit_of_area ?? "sq.ft.",
          min_selected_area_in_unit: p.min_selected_area_in_unit ?? 1725,
          max_selected_area_in_unit: p.max_selected_area_in_unit ?? 2025,
          brochure_name: "Ramprastha Skyz Brochure",
          brochure_pdf_url:
            "https://housing-is-01.s3.amazonaws.com/6a32315a/539cd78d1eb97091141d44cf5f58bdbb/original.pdf",
          brochure_images: [
            "https://is1-3.housingcdn.com/d9dd8fcc/407794a7ef2ad3e4cb759419023b4ad2/v0/version.jpg",
          ],
        },
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }

  // ————— Contract §4.27: show me properties around me → share_location —————
  // Frontend ShareLocation template checks if permission already exists and auto-sends location_shared; ML then responds with property carousel.
  if (matchText(text, "properties around me", "around me", "near me", "show me properties near", "3bhk properties near me")) {
    return [
      botMessage(generateMessageId(), "template", {
        templateId: "share_location",
        data: {},
      }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
    ];
  }

  // ————— Default —————
  return [
    botMessage(generateMessageId(), "text", {
      text: "I can help you find properties! Try asking me to 'show me properties' or ask about localities.",
    }, { sourceMessageId, sequenceNumber: 0, sourceMessageState: "COMPLETED" }),
  ];
}
