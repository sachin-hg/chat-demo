import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { getConversationId, appendEvent } from "@/lib/store";
import type { StoredEvent } from "@/lib/store";

export async function GET(request: NextRequest) {
  const demo = request.nextUrl.searchParams.get("demo") === "true";
  const { conversationId, isNew } = getConversationId();

  if (isNew && demo) {
    try {
      const path = join(process.cwd(), "public", "demo-flow.json");
      const data = JSON.parse(readFileSync(path, "utf-8")) as { messages: StoredEvent[] };
      const messages = data.messages ?? [];
      for (const msg of messages) {
        appendEvent({ ...msg, conversationId });
      }
    } catch (e) {
      console.error("[get-conversation-id] prewarm demo failed", e);
    }
    return NextResponse.json({ conversationId, isNew: false });
  }

  return NextResponse.json({ conversationId, isNew });
}
