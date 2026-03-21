import { NextRequest, NextResponse } from "next/server";
import { cancelRequestByUserEventId } from "@/lib/store";

export async function POST(request: NextRequest) {
  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { eventId } = body;
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }
  cancelRequestByUserEventId(eventId);
  return NextResponse.json({ ok: true });
}
