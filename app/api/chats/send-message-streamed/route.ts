import { NextRequest, NextResponse } from "next/server";
import {
  appendEvent,
  createRequest,
  completeRequest,
  getAllEvents,
  isPending,
  cancelRequestByUserEventId,
  getRequestStateByUserEventId,
} from "@/lib/store";
import { getNextBotEvents } from "@/lib/mock/ml-flow";
import type { ChatEvent } from "@/lib/contract-types";

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

  let body: { event: ChatEvent };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event } = body;
  if (!event?.sender?.type || !event?.payload?.messageType) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const shouldExpectResponse =
    event.payload.messageType === "text" || event.payload.responseRequired === true;
  if (!shouldExpectResponse) {
    return NextResponse.json(
      { error: "Use POST /api/chats/send-message for responseRequired=false turns" },
      { status: 400 }
    );
  }

  const stored = appendEvent({
    ...event,
    conversationId: event.conversationId ?? "c1",
  });
  const requestRecord = createRequest(stored.eventId!, stored.conversationId ?? "c1");
  stored.requestState = "PENDING";

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
        cancelRequestByUserEventId(stored.eventId!);
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
            cancelRequestByUserEventId(stored.eventId!);
            writeSse({ event: "connection_close", data: { reason: "inactivity_15s" } });
            close();
          }
        }, 15000);
      };

      writeSse({
        event: "connection_ack",
        data: {
          eventId: stored.eventId,
          requestState: getRequestStateByUserEventId(stored.eventId!) ?? "PENDING",
        },
      });

      setTimeout(() => {
        if (!isPending(requestRecord.requestId)) {
          completeRequest(requestRecord.requestId);
          close();
          return;
        }

        const recentEvents = getAllEvents();
        const botEvents = getNextBotEvents(stored, recentEvents);

        for (const ev of botEvents) {
          if (!isPending(requestRecord.requestId)) break;
          const state = ev.payload.isFinal === true ? "COMPLETED" : "PENDING";
          const storedBot = appendEvent({
            ...ev,
            conversationId: stored.conversationId ?? "c1",
            requestState: state,
          });

          writeSse({ event: "chat_event", id: storedBot.eventId, data: storedBot });

          if (storedBot.payload.isFinal === true) {
            completeRequest(requestRecord.requestId);
            writeSse({ event: "connection_close", data: { reason: "response_complete" } });
            close();
            return;
          }
        }

        completeRequest(requestRecord.requestId);
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
