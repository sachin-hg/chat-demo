import { NextRequest, NextResponse } from "next/server";
import { getConversationDetails } from "@/lib/store";

export async function GET(request: NextRequest) {
  const tokenIdFromRequest =
    request.headers.get("token_id") ?? request.headers.get("token-id") ?? null;
  const loginAuthTokenFromRequest =
    request.headers.get("login-auth-token") ?? request.headers.get("login_auth_token") ?? null;
  const { conversationId, isNew } = getConversationDetails({
    tokenIdFromRequest,
    loginAuthTokenFromRequest,
  });
  return NextResponse.json({
    statusCode: "2XX",
    responseCode: "SUCCESS",
    data: { conversationId, isNew },
  });
}
