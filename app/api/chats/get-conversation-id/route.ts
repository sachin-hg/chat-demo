import { NextRequest, NextResponse } from "next/server";
import { getConversationId } from "@/lib/store";

export async function GET(_request: NextRequest) {
  const { conversationId, isNew } = getConversationId();
  return NextResponse.json({ conversationId, isNew });
}
