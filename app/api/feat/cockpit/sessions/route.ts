import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateSessionCode } from "@/lib/live-session-utils";

export const dynamic = "force-dynamic";

const MAX_CODE_RETRIES = 5;
const VALID_PDF_KEYS = ["demo-1", "demo-2", "demo-3"] as const;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST { pdf_key } → creates a cockpit session, returns { id, code }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { pdf_key?: string };
    if (!body.pdf_key || !VALID_PDF_KEYS.includes(body.pdf_key as never)) {
      return NextResponse.json({ error: "pdf_key invalide" }, { status: 400 });
    }

    let session = null;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const code = generateSessionCode();
      const { data, error } = await admin()
        .from("cockpit_sessions")
        .insert({ code, pdf_key: body.pdf_key })
        .select("id, code")
        .single();

      if (!error) { session = data; break; }
      if ((error as { code?: string }).code !== "23505") throw error;
    }

    if (!session) return NextResponse.json({ error: "Impossible de générer un code unique" }, { status: 500 });
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("[cockpit/sessions:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
