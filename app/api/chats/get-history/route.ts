import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/store";

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const pageSize = request.nextUrl.searchParams.get("page_size");
  const messagesAfter = request.nextUrl.searchParams.get("messages_after");
  const messagesBefore = request.nextUrl.searchParams.get("messages_before");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 }
    );
  }

  const options: {
    pageSize?: number;
    messagesAfter?: string;
    messagesBefore?: string;
  } = {};
  if (messagesAfter && messagesBefore) {
    return NextResponse.json(
      { error: "messages_before and messages_after cannot be used together" },
      { status: 400 }
    );
  }
  if (messagesAfter) options.messagesAfter = messagesAfter;
  if (messagesBefore) options.messagesBefore = messagesBefore;
  if (pageSize != null) options.pageSize = parseInt(pageSize, 10);

  const result = getHistory(conversationId, options);
  return NextResponse.json(result);
}
