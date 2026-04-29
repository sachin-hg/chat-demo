import { NextRequest, NextResponse } from "next/server";
import { getConversationDetails } from "@/lib/store";

export async function GET(request: NextRequest) {
  const pageSizeRaw = request.nextUrl.searchParams.get("pageSize");
  const messagesAfter = request.nextUrl.searchParams.get("messagesAfter") ?? undefined;
  const messagesBefore = request.nextUrl.searchParams.get("messagesBefore") ?? undefined;

  if (messagesAfter && messagesBefore) {
    return NextResponse.json(
      { error: "messagesAfter and messagesBefore cannot be used together" },
      { status: 400 }
    );
  }

  const tokenIdFromRequest =
    request.headers.get("token_id") ?? request.headers.get("token-id") ?? null;
  const loginAuthTokenFromRequest =
    request.headers.get("login-auth-token") ?? request.headers.get("login_auth_token") ?? null;

  const pageSize = pageSizeRaw != null ? Number(pageSizeRaw) : undefined;
  const result = getConversationDetails({
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    messagesAfter,
    messagesBefore,
    tokenIdFromRequest,
    loginAuthTokenFromRequest,
  });

  return NextResponse.json({ statusCode: "2XX", responseCode: "SUCCESS", data: result });
}

