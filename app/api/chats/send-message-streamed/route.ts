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
import { getNextBotEvents } from "@/lib/mock/ml-flow";
import type { ChatEventFromUser, ChatEventToML, CancelEventToML } from "@/lib/contract-types";

const DELAYS_MS = [61000];
function getMockDelayMs(): number {
  const enabled = process.env.ENABLE_MOCK_ML_DELAYS === "true" || process.env.ENABLE_MOCK_ML_DELAYS === "1";
  if (!enabled) return 0;
  return DELAYS_MS[Math.floor(Math.random() * DELAYS_MS.length)];
}

export async function POST(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    return NextResponse.json(
      { error: "This endpoint requires Accept: text/event-stream" },
      { status: 406 }
    );
  }

  let body: { event: ChatEventFromUser };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event } = body;
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

  const stored = appendEvent({
    ...event,
    conversationId: event.conversationId,
  });
  createRequest(stored.messageId!, stored.conversationId);
  stored.messageState = "PENDING";

  const mockDelay = getMockDelayMs();
  const delayMs = mockDelay > 0 ? mockDelay : 100;

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
          conversationId: stored.conversationId,
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
              conversationId: stored.conversationId,
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

      setTimeout(() => {
        if (!isPending(stored.messageId!)) {
          completeRequest(stored.messageId!);
          close();
          return;
        }

        const loginAuthToken = request.headers.get("login_auth_token") ?? undefined;
        const gaId = request.headers.get("_ga") ?? undefined;
        const userId = loginAuthToken ? "authenticated_user" : undefined;

        const eventToML: ChatEventToML = {
          conversationId: stored.conversationId,
          messageId: stored.messageId!,
          messageType: stored.messageType,
          messageState: "PENDING",
          createdAt: stored.createdAt!,
          sender: {
            type: stored.sender.type,
            userId,
            gaId,
          },
          content: stored.content,
          responseRequired: stored.responseRequired ?? false,
        };

        const recentEvents = getAllEvents();
        const botEvents = getNextBotEvents(eventToML, recentEvents);

        for (const ev of botEvents) {
          const sourceState = getMessageStateByUserMessageId(ev.sourceMessageId);
          if (sourceState !== "PENDING" && sourceState !== "IN_PROGRESS") {
            continue;
          }
          updateMessageStateByUserMessageId(ev.sourceMessageId, ev.messageState);
          const storedBot = appendEvent({
            ...ev,
            sender: { type: "bot" },
            conversationId: stored.conversationId,
            // ML messages are persisted as completed user-visible messages.
            messageState: "COMPLETED",
          });

          writeSse({ event: "chat_event", id: storedBot.messageId, data: storedBot });

          if (ev.messageState === "COMPLETED" || ev.messageState === "ERRORED_AT_ML") {
            completeRequest(stored.messageId!);
            writeSse({ event: "connection_close", data: { reason: "response_complete" } });
            close();
            return;
          }
        }

        completeRequest(stored.messageId!);
        close();
      }, delayMs);
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
