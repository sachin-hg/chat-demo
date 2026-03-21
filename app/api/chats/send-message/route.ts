import { NextRequest, NextResponse } from "next/server";
import { appendEvent, createRequest, completeRequest, getMessageStateByUserMessageId } from "@/lib/store";
import type { ChatEventFromUser } from "@/lib/contract-types";

export async function POST(request: NextRequest) {
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
  if (shouldExpectResponse) {
    return NextResponse.json(
      { error: "Use POST /api/chats/send-message-streamed for responseRequired=true turns" },
      { status: 400 }
    );
  }

  const stored = appendEvent({ ...event });
  createRequest(stored.messageId!, event.conversationId);
  completeRequest(stored.messageId!);
  stored.messageState = "COMPLETED";

  return NextResponse.json({
    messageId: stored.messageId,
    messageState: getMessageStateByUserMessageId(stored.messageId!) ?? "COMPLETED",
  });
}
