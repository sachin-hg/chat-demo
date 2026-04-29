import { NextRequest, NextResponse } from "next/server";
import { migrateConversation } from "@/lib/store";

export async function POST(request: NextRequest) {
  const loginToken = request.headers.get("login-auth-token");
  const tokenId = request.headers.get("token_id");

  // Production contract: both are mandatory, else 400.
  if (!loginToken || !tokenId) {
    return NextResponse.json(
      { error: "login-auth-token and token_id headers are required" },
      { status: 400 }
    );
  }

  const strategyEnabled =
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === undefined ||
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === "true" ||
    process.env.ENABLE_CHAT_MIGRATION_STRATEGY === "1";

  if (!strategyEnabled) {
    return NextResponse.json({});
  }

  // In this demo store we only model a single active conversation at a time.
  // We keep the legacy query param optional to avoid wiring changes everywhere.
  const currentConversationId =
    request.nextUrl.searchParams.get("currentConversationId") ?? "c1";

  const result = migrateConversation(currentConversationId);
  return NextResponse.json({ statusCode: "2XX", responseCode: "SUCCESS", data: { new_conversation_id: result.newConversationId } });
}

