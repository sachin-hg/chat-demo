import { NextRequest, NextResponse } from "next/server";
import {
  appendEvent,
  createRequest,
  completeRequest,
  getAllEvents,
  isPending,
  cancelRequest,
} from "@/lib/store";
import { getNextBotEvents } from "@/lib/mock/ml-flow";
import type { ChatEvent } from "@/lib/contract-types";

// const DELAYS_MS = [0, 1000, 2000,500, 200, 400, 600, 50, 10, 15, 1100, 1200, 1250, 850, 5000, 10000, 15000, 25000, 26000]; // 5s, 15s, 60s - pick one randomly to mock ML latency

const DELAYS_MS = [61000]; // 5s, 15s, 60s - pick one randomly to mock ML latency
function getMockDelayMs(): number {
  const enabled = process.env.ENABLE_MOCK_ML_DELAYS === "true" || process.env.ENABLE_MOCK_ML_DELAYS === "1";
  if (!enabled) return 0;
  return DELAYS_MS[Math.floor(Math.random() * DELAYS_MS.length)];
}

export async function POST(request: NextRequest) {
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

  const stored = appendEvent({
    ...event,
    conversationId: event.conversationId ?? "conv_1",
  });
  const requestRecord = createRequest(stored.eventId!);

  const accept = request.headers.get("accept") ?? "";
  const wantsEventStream = accept.includes("text/event-stream");

  // responseRequired controls whether FE expects bot response(s) for user_action.
  // For text messages, response is expected until isFinal=true.
  const shouldExpectResponse =
    event.payload.messageType === "text" || event.payload.responseRequired === true;

  // Return 202 immediately; run mock ML after optional artificial delay (set ENABLE_MOCK_ML_DELAYS=true to enable)
  const mockDelay = getMockDelayMs();
  console.log('Mock Delay', mockDelay)
  const delayMs = mockDelay > 0 ? mockDelay : 100; // when off, use 100ms so 202 is sent before we broadcast

  // Legacy JSON mode (keeps old behavior for non-streaming clients).
  if (!wantsEventStream) {
    setTimeout(() => {
      const recentEvents = getAllEvents();
      const botEvents = getNextBotEvents(event, recentEvents);
      for (const ev of botEvents) {
        appendEvent({ ...ev, conversationId: "conv_1" });
      }
      completeRequest(requestRecord.requestId);
    }, delayMs);

    return NextResponse.json({
      eventId: stored.eventId,
      requestId: requestRecord.requestId,
    });
  }

  // Streaming mode: FE POSTs once, BE streams ack + bot events until isFinal=true.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch (_) {}
      };

      const abortHandler = () => {
        cancelRequest(requestRecord.requestId);
        close();
      };
      request.signal.addEventListener("abort", abortHandler, { once: true });

      const writeSse = (opts: { event?: string; id?: string; data: unknown }) => {
        const eventLine = opts.event ? `event: ${opts.event}\n` : "";
        const idLine = opts.id ? `id: ${opts.id}\n` : "";
        controller.enqueue(
          encoder.encode(`${idLine}${eventLine}data: ${JSON.stringify(opts.data)}\n\n`)
        );
      };

      // 1) Ack immediately
      writeSse({
        event: "connection_ack",
        data: { eventId: stored.eventId, requestId: requestRecord.requestId },
      });

      if (!shouldExpectResponse) {
        completeRequest(requestRecord.requestId);
        close();
        return;
      }

      // 2) Run mock ML after optional delay and stream bot events as they arrive
      setTimeout(() => {
        // If the client closed/aborted, don't keep producing events.
        if (!isPending(requestRecord.requestId)) {
          completeRequest(requestRecord.requestId);
          close();
          return;
        }

        const recentEvents = getAllEvents();
        const botEvents = getNextBotEvents(event, recentEvents);

        for (const ev of botEvents) {
          if (!isPending(requestRecord.requestId)) break;
          const storedBot = appendEvent({ ...ev, conversationId: "conv_1" });

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
