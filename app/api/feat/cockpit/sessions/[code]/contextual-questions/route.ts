import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getContextualQuestions, generateLiveQuestions } from "@/lib/contextual-questions";
import type { DemoPdfKey } from "@/types/post-course";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CODE_RE = /^[A-Z2-9]{6}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET ?page=5&generate=true → return questions near current page, optionally generating new ones
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get("page");
    const shouldGenerate = url.searchParams.get("generate") === "true";

    const { data: session } = await admin()
      .from("cockpit_sessions")
      .select("pdf_key, current_page, transcript, ended_at")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    const currentPage = pageParam
      ? Math.max(1, parseInt(pageParam, 10))
      : (session.current_page as number);

    const existing = await getContextualQuestions(null, code.toUpperCase(), currentPage);
    let aiGenerated: Awaited<ReturnType<typeof generateLiveQuestions>> = [];

    if (shouldGenerate) {
      aiGenerated = await generateLiveQuestions(
        null,
        "",
        code.toUpperCase(),
        currentPage,
        session.pdf_key as DemoPdfKey,
        session.transcript as string,
      );
    }

    return NextResponse.json({
      questions: [...aiGenerated, ...existing],
      ai_generated_count: aiGenerated.length,
      current_page: currentPage,
    });
  } catch (err) {
    console.error("[cockpit/sessions/[code]/contextual-questions:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
