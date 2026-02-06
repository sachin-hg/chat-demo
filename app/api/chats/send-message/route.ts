import { NextRequest, NextResponse } from "next/server";
import { appendEvent, createRequest, completeRequest, getAllEvents } from "@/lib/store";
import { getNextBotEvents } from "@/lib/mock/ml-flow";
import type { ChatEvent } from "@/lib/contract-types";
import { mock } from "node:test";

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
  if (!event?.eventType || !event?.sender?.type || !event?.payload?.messageType) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const stored = appendEvent({
    ...event,
    conversationId: event.conversationId ?? "conv_1",
  });
  const requestRecord = createRequest(stored.eventId!);

  // Return 202 immediately; run mock ML after optional artificial delay (set ENABLE_MOCK_ML_DELAYS=true to enable)
  const mockDelay = getMockDelayMs();
  console.log('Mock Delay', mockDelay)
  const delayMs = mockDelay > 0 ? mockDelay : 100; // when off, use 100ms so 202 is sent before we broadcast
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
    expectResponse: event?.payload?.messageType !== 'context' && event?.payload?.messageType !== 'analytics',
  });
}
