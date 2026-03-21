import { NextRequest, NextResponse } from "next/server";
import { cancelRequestByUserMessageId } from "@/lib/store";

export async function POST(request: NextRequest) {
  let body: { messageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { messageId } = body;
  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }
  cancelRequestByUserMessageId(messageId);
  return NextResponse.json({ ok: true });
}
