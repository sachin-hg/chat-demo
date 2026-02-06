import { NextRequest, NextResponse } from "next/server";
import { cancelRequest } from "@/lib/store";

export async function POST(request: NextRequest) {
  let body: { requestId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { requestId } = body;
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }
  cancelRequest(requestId);
  return NextResponse.json({ ok: true });
}
