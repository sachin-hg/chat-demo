import { NextRequest, NextResponse } from "next/server";
import { appendEvent, createRequest, completeRequest, getRequestStateByUserEventId } from "@/lib/store";
import type { ChatEvent } from "@/lib/contract-types";

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

  const shouldExpectResponse =
    event.payload.messageType === "text" || event.payload.responseRequired === true;
  if (shouldExpectResponse) {
    return NextResponse.json(
      { error: "Use POST /api/chats/send-message-streamed for responseRequired=true turns" },
      { status: 400 }
    );
  }

  const stored = appendEvent({
    ...event,
    conversationId: event.conversationId ?? "c1",
  });
  const requestRecord = createRequest(stored.eventId!, stored.conversationId ?? "c1");
  completeRequest(requestRecord.requestId);
  stored.requestState = "COMPLETED";

  return NextResponse.json({
    eventId: stored.eventId,
    requestState: getRequestStateByUserEventId(stored.eventId!) ?? "COMPLETED",
  });
}
