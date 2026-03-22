import { NextRequest, NextResponse } from "next/server";
import {
  appendEvent,
  createRequest,
  completeRequest,
  getAllEvents,
  isPending,
  cancelRequestByUserMessageId,
  getMessageStateByUserMessageId,
  updateMessageStateByUserMessageId,
} from "@/lib/store";
import { getNextBotEvents, splitTextIntoStreamPhrases } from "@/lib/mock/ml-flow";
import type {
  ChatEvent,
  ChatEventFromUser,
  ChatEventToML,
  CancelEventToML,
  MessageDeltaEventToUser,
} from "@/lib/contract-types";

const MOCK_ML_INITIAL_DELAYS_MS = [2500];
/** When `ENABLE_MOCK_ML_DELAYS` is set, wait this long between consecutive `chat_event` SSE lines. */
const MOCK_ML_PER_CHAT_EVENT_MS = 2500;
/** Delay between v1.1 `message_delta` phrases (mock streaming). */
function getMockPerDeltaMs(): number {
  const raw = process.env.MOCK_ML_PER_DELTA_MS;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 190;
}

function mockMlDelaysEnabled(): boolean {
  return process.env.ENABLE_MOCK_ML_DELAYS === "true" || process.env.ENABLE_MOCK_ML_DELAYS === "1";
}

function getMockInitialDelayMs(): number {
  if (!mockMlDelaysEnabled()) return 0;
  return MOCK_ML_INITIAL_DELAYS_MS[Math.floor(Math.random() * MOCK_ML_INITIAL_DELAYS_MS.length)];
}

function getMockPerChatEventDelayMs(): number {
  return mockMlDelaysEnabled() ? MOCK_ML_PER_CHAT_EVENT_MS : 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test-only: after the first bot message is persisted, randomly close the SSE stream **without**
 * sending `chat_event` or `connection_close`, to simulate an abrupt disconnect. The bot row is
 * still in the store so `GET /get-history` can recover.
 *
 * - `ENABLE_MOCK_SSE_RANDOM_DROP=true` — always drop after first persisted bot part.
 * - `MOCK_SSE_RANDOM_DROP_PROBABILITY` — e.g. `0.3` for a 30% chance (0–1). Ignored when ENABLE is set.
 */
function shouldMockRandomSseDrop(): boolean {
  if (process.env.ENABLE_MOCK_SSE_RANDOM_DROP === "true" || process.env.ENABLE_MOCK_SSE_RANDOM_DROP === "1") {
    return true;
  }
  const raw = process.env.MOCK_SSE_RANDOM_DROP_PROBABILITY;
  if (raw == null || raw === "") return false;
  const p = Number(raw);
  if (Number.isNaN(p) || p <= 0) return false;
  if (p >= 1) return true;
  return Math.random() < p;
}

export async function POST(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    return NextResponse.json(
      { error: "This endpoint requires Accept: text/event-stream" },
      { status: 406 }
    );
  }

  let event: ChatEventFromUser;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!event?.sender?.type || !event?.messageType || !event?.conversationId) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const shouldExpectResponse =
    event.messageType === "text" || event.responseRequired === true;
  if (!shouldExpectResponse) {
    return NextResponse.json(
      { error: "Use POST /api/chats/send-message for responseRequired=false turns" },
      { status: 400 }
    );
  }

  const stored = appendEvent({ ...event });
  createRequest(stored.messageId!, event.conversationId);
  stored.messageState = "PENDING";

  const mockInitialDelay = getMockInitialDelayMs();
  const delayBeforeMlMs = mockInitialDelay > 0 ? mockInitialDelay : 100;
  const perChatEventMs = getMockPerChatEventDelayMs();
  const perDeltaMs = getMockPerDeltaMs();
  const streamingEnabled =
    request.nextUrl.searchParams.get("streamingEnabled") === "true" &&
    process.env.ENABLE_INCREMENTAL_STREAMING !== "false";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
      const close = () => {
        if (closed) return;
        closed = true;
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
        try {
          controller.close();
        } catch (_) {}
      };

      const abortHandler = () => {
        const cancelEventToML: CancelEventToML = {
          sender: { type: "system" },
          conversationId: event.conversationId,
          messageIdToCancel: stored.messageId,
          cancelReason: "CANCELLED_BY_USER",
        };
        void cancelEventToML;
        cancelRequestByUserMessageId(stored.messageId!);
        close();
      };
      request.signal.addEventListener("abort", abortHandler, { once: true });

      const writeSse = (opts: { event?: string; id?: string; data: unknown }) => {
        const eventLine = opts.event ? `event: ${opts.event}\n` : "";
        const idLine = opts.id ? `id: ${opts.id}\n` : "";
        controller.enqueue(
          encoder.encode(`${idLine}${eventLine}data: ${JSON.stringify(opts.data)}\n\n`)
        );
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          if (!closed) {
            const cancelEventToML: CancelEventToML = {
              sender: { type: "system" },
              conversationId: event.conversationId,
              messageIdToCancel: stored.messageId,
              cancelReason: "TIMED_OUT_BY_BE",
            };
            void cancelEventToML;
            cancelRequestByUserMessageId(stored.messageId!);
            writeSse({ event: "connection_close", data: { reason: "inactivity_15s" } });
            close();
          }
        }, 15000);
      };

      writeSse({
        event: "connection_ack",
        data: {
          messageId: stored.messageId,
          messageState: getMessageStateByUserMessageId(stored.messageId!) ?? "PENDING",
        },
      });

      void (async () => {
        try {
          await delay(delayBeforeMlMs);
          if (closed || request.signal.aborted) return;

          if (!isPending(stored.messageId!)) {
            completeRequest(stored.messageId!);
            close();
            return;
          }

          const loginAuthToken = request.headers.get("login_auth_token") ?? undefined;
          const gaId = request.headers.get("_ga") ?? undefined;
          const userId = loginAuthToken ? "authenticated_user" : undefined;

          const eventToML: ChatEventToML = {
            conversationId: event.conversationId,
            messageId: stored.messageId!,
            messageType: event.messageType,
            messageState: "PENDING",
            createdAt: stored.createdAt!,
            sender: {
              type: event.sender.type,
              userId,
              gaId,
            },
            content: event.content,
            responseRequired: event.responseRequired ?? false,
          };

          const recentEvents = getAllEvents();
          const botEvents = getNextBotEvents(eventToML, recentEvents as ChatEvent[]);

          for (let i = 0; i < botEvents.length; i++) {
            if (closed || request.signal.aborted) return;
            if (i > 0 && perChatEventMs > 0) {
              await delay(perChatEventMs);
              if (closed || request.signal.aborted) return;
            }

            const ev = botEvents[i];
            const sourceState = getMessageStateByUserMessageId(ev.sourceMessageId);
            if (sourceState !== "PENDING" && sourceState !== "IN_PROGRESS") {
              continue;
            }
            updateMessageStateByUserMessageId(ev.sourceMessageId, ev.sourceMessageState);

            const isTextualPart =
              (ev.messageType === "text" || ev.messageType === "markdown") &&
              typeof ev.content?.text === "string" &&
              ev.content.text.length > 0;

            if (streamingEnabled && isTextualPart) {
              const phrases = splitTextIntoStreamPhrases(ev.content!.text!).filter((p) => p.length > 0);
              const streamMessageId = ev.messageId ?? `msg_stream_${Date.now()}`;
              const seq = ev.sequenceNumber ?? 0;
              const mt: "text" | "markdown" = ev.messageType === "markdown" ? "markdown" : "text";

              for (let c = 0; c < phrases.length; c++) {
                if (closed || request.signal.aborted) return;
                if (c > 0 && perDeltaMs > 0) {
                  await delay(perDeltaMs);
                  if (closed || request.signal.aborted) return;
                }
                const delta: MessageDeltaEventToUser = {
                  messageId: streamMessageId,
                  sourceMessageId: ev.sourceMessageId,
                  sequenceNumber: seq,
                  messageType: c === 0 ? mt : undefined,
                  chunkIndex: c,
                  content: { text: phrases[c] },
                };
                writeSse({ event: "message_delta", data: delta });
              }
            }

            const storedBot = appendEvent({
              ...ev,
              sender: { type: "bot" },
              conversationId: event.conversationId,
              // Each persisted bot **part** is a complete row; turn progress is `sourceMessageState`.
              messageState: "COMPLETED",
              sourceMessageState: ev.sourceMessageState,
            });

            if (i === 0 && shouldMockRandomSseDrop()) {
              completeRequest(stored.messageId!);
              close();
              return;
            }

            writeSse({ event: "chat_event", id: storedBot.messageId, data: storedBot });

            if (ev.sourceMessageState === "COMPLETED" || ev.sourceMessageState === "ERRORED_AT_ML") {
              completeRequest(stored.messageId!);
              writeSse({ event: "connection_close", data: { reason: "response_complete" } });
              close();
              return;
            }
          }

          completeRequest(stored.messageId!);
          close();
        } catch {
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache",
      Connection: "keep-alive",
    },
  });
}
