import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: true,
    login_auth_token: "mock_login_auth_token",
  });
}
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    await request.json().catch(() => null);
    return NextResponse.json({ success: true as const });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

