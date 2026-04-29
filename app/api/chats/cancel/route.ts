import { NextRequest, NextResponse } from "next/server";
import { cancelRequestByUserMessageId } from "@/lib/store";
import type { CancelEventToML } from "@/lib/contract-types";

export async function POST(request: NextRequest) {
  let body: { messageId?: string; conversationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { messageId, conversationId } = body;
  if (!messageId || !conversationId) {
    return NextResponse.json({ error: "messageId and conversationId required" }, { status: 400 });
  }

  const loginAuthToken = request.headers.get("login_auth_token") ?? undefined;
  const gaId = request.headers.get("_ga") ?? undefined;
  const userId = loginAuthToken ? "authenticated_user" : undefined;
  const cancelEventToML: CancelEventToML = {
    sender: { type: "system", userId, gaId },
    conversationId,
    messageIdToCancel: messageId,
    cancelReason: "CANCELLED_BY_USER",
  };
  // Phase 1 mock: cancellation signal object is built per contract, dispatch is no-op.
  void cancelEventToML;

  cancelRequestByUserMessageId(messageId);
  return NextResponse.json({
    statusCode: "2XX",
    responseCode: "SUCCESS",
    data: { ok: true },
  });
}
