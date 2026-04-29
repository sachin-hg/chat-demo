import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    await request.json().catch(() => null);
    return NextResponse.json({
      statusCode: "2XX",
      responseCode: "SUCCESS",
      data: {
        success: true,
        login_auth_token: "mock_login_auth_token",
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
