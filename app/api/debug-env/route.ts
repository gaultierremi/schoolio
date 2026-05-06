import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    has_token: !!process.env.BOARD_EXPORT_TOKEN,
    token_length: process.env.BOARD_EXPORT_TOKEN?.length ?? 0,
    token_first_4: process.env.BOARD_EXPORT_TOKEN?.slice(0, 4) ?? null,
    token_last_4: process.env.BOARD_EXPORT_TOKEN?.slice(-4) ?? null,
  });
}
