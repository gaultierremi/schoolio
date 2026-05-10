import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET → public read of an active live session by code (slave page bootstrap)
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const admin = createAdminClient();

    const { data: session, error } = await admin
      .from("live_sessions")
      .select("id, code, course_id, class_id, current_page, total_pages, scroll_y, zoom, started_at, ended_at")
      .eq("code", params.code.toUpperCase())
      .is("ended_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!session) return NextResponse.json({ error: "Session introuvable ou terminée" }, { status: 404 });

    return NextResponse.json(session);
  } catch (err) {
    console.error("[live/[code]:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
