import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEMO_PDFS } from "@/lib/cockpit/session";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z2-9]{6}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET → returns the public URL for the demo PDF (no signed URL, served from /public/)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const { data: session } = await admin()
      .from("cockpit_sessions")
      .select("pdf_key")
      .eq("code", code.toUpperCase())
      .is("ended_at", null)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable ou terminée" }, { status: 404 });

    const pdf = DEMO_PDFS.find((p) => p.key === session.pdf_key);
    return NextResponse.json({
      url: `/demo-pdfs/${session.pdf_key}.pdf`,
      title: pdf?.title ?? session.pdf_key,
    });
  } catch (err) {
    console.error("[cockpit/display/[code]/pdf-url:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
