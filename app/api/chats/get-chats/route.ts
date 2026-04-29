import { NextResponse } from "next/server";
import { getConversationDetails } from "@/lib/store";

export async function GET() {
  // Compatibility shim: the v1 contract removed get-chats.
  // Keep a minimal single-thread response so older demo callers do not break.
  const details = getConversationDetails();
  return NextResponse.json({
    statusCode: "2XX",
    responseCode: "SUCCESS",
    data: {
      chats: [
        {
          conversationId: details.conversationId,
          createdAt: details.messages[0]?.createdAt ?? null,
          lastActivityAt:
            details.messages[details.messages.length - 1]?.createdAt ?? null,
        },
      ],
      deprecated: true,
    },
  });
}
