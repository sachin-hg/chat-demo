import { NextRequest, NextResponse } from "next/server";
import { getConversationDetails, getConversationId } from "@/lib/store";

export async function GET(request: NextRequest) {
  const requestedConversationId = request.nextUrl.searchParams.get("conversationId");
  const pageSize = request.nextUrl.searchParams.get("page_size");
  const messagesAfter = request.nextUrl.searchParams.get("messages_after");
  const messagesBefore = request.nextUrl.searchParams.get("messages_before");

  const { conversationId: activeConversationId } = getConversationId();
  const conversationId = requestedConversationId ?? activeConversationId;

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

  const tokenIdFromRequest =
    request.headers.get("token_id") ?? request.headers.get("token-id") ?? null;
  const loginAuthTokenFromRequest =
    request.headers.get("login-auth-token") ?? request.headers.get("login_auth_token") ?? null;
  const result = getConversationDetails({
    pageSize: options.pageSize,
    messagesAfter: options.messagesAfter,
    messagesBefore: options.messagesBefore,
    tokenIdFromRequest,
    loginAuthTokenFromRequest,
  });

  // Legacy shape intentionally omits tokenId/isNew and preserves requested conversationId when supplied.
  return NextResponse.json({
    statusCode: "2XX",
    responseCode: "SUCCESS",
    data: {
      conversationId,
      messages: result.messages,
      hasMore: result.hasMore,
    },
  });
}
