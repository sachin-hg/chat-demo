import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const propertyId = body?.propertyId;
    if (!propertyId || typeof propertyId !== "string") {
      return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    }
    // Mock: assume seller is contacted off-platform
    return NextResponse.json({ success: true as const });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

