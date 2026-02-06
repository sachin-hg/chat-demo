import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/store";

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const page = request.nextUrl.searchParams.get("page");
  const pageSize = request.nextUrl.searchParams.get("page_size");
  const messagesAfter = request.nextUrl.searchParams.get("messages_after");
  const messagesBefore = request.nextUrl.searchParams.get("messages_before");
  const last = request.nextUrl.searchParams.get("last");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 }
    );
  }

  const options: {
    page?: number;
    pageSize?: number;
    messagesAfter?: string;
    messagesBefore?: string;
    last?: number;
  } = {};
  if (messagesAfter) options.messagesAfter = messagesAfter;
  if (messagesBefore) options.messagesBefore = messagesBefore;
  if (last != null) options.last = parseInt(last, 10);
  if (page != null) options.page = parseInt(page, 10);
  if (pageSize != null) options.pageSize = parseInt(pageSize, 10);

  const result = getHistory(conversationId, options);
  return NextResponse.json(result);
}
