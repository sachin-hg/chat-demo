#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

const BASE_URL =
  "https://platform-chatbot.housing.com/api/v1/chat/get-conversation-details";
const OUT_FILE = "sample_conversation.json";

// Prefer env overrides so you can avoid hardcoding secrets.
const HEADERS = {
  "User-Agent": "Native/android",
  app_name: "com.locon.housing",
  app_version: "15.0.5",
  price_ex: "false",
  client_id: process.env.CLIENT_ID ?? "6865536d276bc8b7",
  "login-auth-token":
    process.env.LOGIN_AUTH_TOKEN ??
    "JB_k2q3ucSgLpgbIy0L8QYcrWTuUqeKjHUUAVGrN8ZV4rBv30ABekSRgB6hi_5xmCA187RS0jqKnKwB_h-3qm-gV4lQz00FLFKN-g2TyKxnsuKvQwTkqlLZcDpmX-__m1tYpKHVilSpPy7vm9SZ0SSdtfLOBM9WSaYXEwO-gbOI",
  ga_id: process.env.GA_ID ?? "6865536d276bc8b7",
  token_id: process.env.TOKEN_ID ?? "token_01KQ78BJY3Y0J02SRN6YDM3PYT",
  tracestate:
    process.env.TRACESTATE ??
    "@nr=0-2---46e11f736fcf4b0c----1777289031696",
  traceparent:
    process.env.TRACEPARENT ??
    "00-740d1780b3af4ffb94c4ca4d6f2cd013-46e11f736fcf4b0c-01",
  newrelic:
    process.env.NEWRELIC ??
    '{"v":[0,2],"d":{"ty":"Mobile","ac":"","ap":"","tr":"740d1780b3af4ffb94c4ca4d6f2cd013","id":"46e11f736fcf4b0c","ti":1777289031696,"tk":""}}',
};

function buildUrl({ pageSize, messagesBefore }) {
  const u = new URL(BASE_URL);
  u.searchParams.set("pageSize", String(pageSize));
  if (messagesBefore) u.searchParams.set("messagesBefore", String(messagesBefore));
  return u.toString();
}

async function httpGetJson(url, { headers, timeoutMs = 30_000 }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(
        `HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 500)}`
      );
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${text.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

function pickOldestMessageId(messages) {
  /** Return messageId of oldest message (by createdAt then messageId). */
  const candidates = [];
  for (const m of messages ?? []) {
    const mid = m?.messageId;
    const createdAt = m?.createdAt;
    if (mid == null || createdAt == null) continue;
    candidates.push({ createdAt, messageId: String(mid) });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return a.messageId.localeCompare(b.messageId);
  });
  return candidates[0].messageId;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const pageSize = 20;
  let messagesBefore = null;
  let hasMore = true;
  let page = 0;

  const allMessages = [];
  const seenIds = new Set();

  while (hasMore) {
    page += 1;

    const url = buildUrl({ pageSize, messagesBefore });
    const payload = await httpGetJson(url, { headers: HEADERS });

    const data = payload?.data ?? {};
    const messages = Array.isArray(data.messages) ? data.messages : [];
    hasMore = Boolean(data.hasMore);

    const receivedMessageIds = messages
      .map((m) => m?.messageId)
      .filter((x) => x != null)
      .map(String);

    // Per-loop logging requested.
    console.log(
      JSON.stringify(
        {
          page,
          messagesBeforeUsed: messagesBefore,
          hasMore,
          receivedMessageIds,
        },
        null,
        0
      )
    );

    // De-dupe by messageId while preserving arrival order.
    for (const m of messages) {
      const mid = m?.messageId;
      if (mid == null) {
        allMessages.push(m);
        continue;
      }
      const midS = String(mid);
      if (seenIds.has(midS)) continue;
      seenIds.add(midS);
      allMessages.push(m);
    }

    if (hasMore) {
      const nextBefore = pickOldestMessageId(messages);
      if (!nextBefore) {
        throw new Error(
          "API says hasMore=true but page has no usable (messageId, createdAt) to continue pagination."
        );
      }
      if (messagesBefore === nextBefore) {
        throw new Error(
          `Pagination appears stuck (messagesBefore would repeat: ${messagesBefore}).`
        );
      }
      messagesBefore = nextBefore;
    }

    // Small delay to be gentle (tweak/remove as needed).
    await sleep(50);
  }

  // Sort final output ascending by createdAt (stable tiebreakers).
  allMessages.sort((a, b) => {
    const aCreated = a?.createdAt;
    const bCreated = b?.createdAt;
    if (aCreated == null && bCreated == null) return 0;
    if (aCreated == null) return 1;
    if (bCreated == null) return -1;
    if (aCreated < bCreated) return -1;
    if (aCreated > bCreated) return 1;
    const aId = a?.messageId == null ? "" : String(a.messageId);
    const bId = b?.messageId == null ? "" : String(b.messageId);
    return aId.localeCompare(bId);
  });

  await writeFile(OUT_FILE, JSON.stringify(allMessages, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${allMessages.length} messages (sorted by createdAt asc) to ${OUT_FILE}`);
}

await main();

