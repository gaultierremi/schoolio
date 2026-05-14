import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z2-9]{6}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST { active: boolean, transcript?: string } → toggle listening_active + optional transcript sync
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const body = await req.json() as { active?: boolean; transcript?: string };
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active (boolean) requis" }, { status: 400 });
    }
    if (body.transcript !== undefined && (typeof body.transcript !== "string" || body.transcript.length > 50_000)) {
      return NextResponse.json({ error: "transcript invalide" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      listening_active: body.active,
      updated_at: new Date().toISOString(),
    };
    if (body.transcript !== undefined) patch.transcript = body.transcript;

    const { error } = await admin()
      .from("cockpit_sessions")
      .update(patch)
      .eq("code", code.toUpperCase());

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cockpit/sessions/[code]/listen-toggle:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
