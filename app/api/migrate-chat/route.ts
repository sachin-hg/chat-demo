import { NextRequest, NextResponse } from "next/server";
import { migrateConversation } from "@/lib/store";

export async function POST(request: NextRequest) {
  const loginToken = request.headers.get("login_auth_token");
  const currentConversationId = request.nextUrl.searchParams.get("currentConversationId");

  if (!currentConversationId) {
    return NextResponse.json({ error: "currentConversationId is required" }, { status: 400 });
  }
  if (!loginToken) {
    return NextResponse.json({ error: "login_auth_token header is required" }, { status: 401 });
  }

  const strategyEnabled =
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === undefined ||
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === "true" ||
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === "1";

  if (!strategyEnabled) {
    return NextResponse.json({});
  }

  const result = migrateConversation(currentConversationId);
  return NextResponse.json({ newConversationId: result.newConversationId });
}
