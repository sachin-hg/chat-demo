import { NextRequest, NextResponse } from "next/server";
import { migrateConversation } from "@/lib/store";

export async function POST(request: NextRequest) {
  const loginToken = request.headers.get("login-auth-token") ?? request.headers.get("login_auth_token");
  const tokenId = request.headers.get("token_id");
  const currentConversationId = request.nextUrl.searchParams.get("currentConversationId");

  if (!currentConversationId) {
    return NextResponse.json({ error: "currentConversationId is required" }, { status: 400 });
  }
  // Newer contract requires both headers; keep legacy behavior for demo clients.
  if (!loginToken) return NextResponse.json({ error: "login-auth-token header is required" }, { status: 401 });
  if (!tokenId) return NextResponse.json({ error: "token_id header is required" }, { status: 400 });

  const strategyEnabled =
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === undefined ||
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === "true" ||
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === "1";

  if (!strategyEnabled) {
    return NextResponse.json({});
  }

  const result = migrateConversation(currentConversationId);
  return NextResponse.json({
    statusCode: "2XX",
    responseCode: "SUCCESS",
    data: { new_conversation_id: result.newConversationId },
  });
}
