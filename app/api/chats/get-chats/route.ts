import { NextResponse } from "next/server";
import { getChats } from "@/lib/store";

export async function GET() {
  const body = getChats();
  return NextResponse.json(body);
}
