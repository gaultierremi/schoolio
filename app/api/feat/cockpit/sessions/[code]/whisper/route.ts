import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateWhisper } from "@/lib/cockpit/question-prompt";
import type { DemoPdfKey } from "@/types/post-course";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z2-9]{6}$/;
const AI_TIMEOUT_MS = 14_000;

const WHISPER_STUDENTS = [
  { name: "Lucas D.",  avatar: "🧑‍💻" },
  { name: "Emma R.",   avatar: "👩‍🔬" },
  { name: "Maxime L.", avatar: "👨‍🎓" },
  { name: "Sofia K.",  avatar: "👩‍🎨" },
];

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST { page } → generate a Maia whisper for the current page from transcript buffer
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const body = await req.json() as { page?: number };
    if (typeof body.page !== "number" || body.page < 1) {
      return NextResponse.json({ error: "page invalide" }, { status: 400 });
    }

    const { data: session } = await admin()
      .from("cockpit_sessions")
      .select("pdf_key, transcript")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    // Rotate through students by page number
    const student = WHISPER_STUDENTS[body.page % WHISPER_STUDENTS.length];

    const abortCtrl = new AbortController();
    const timeout = setTimeout(() => abortCtrl.abort(), AI_TIMEOUT_MS);

    try {
      const whisper = await generateWhisper({
        pdfKey: session.pdf_key as DemoPdfKey,
        page: body.page,
        transcript: session.transcript as string ?? "",
        studentName: student.name,
        studentAvatar: student.avatar,
      });
      clearTimeout(timeout);
      return NextResponse.json({ whisper });
    } catch (err) {
      clearTimeout(timeout);
      if (abortCtrl.signal.aborted) {
        // Timeout: return a fallback mock whisper rather than an error (cours must continue)
        return NextResponse.json({
          whisper: {
            id: randomBytes(4).toString("hex"),
            student: student.name,
            avatar: student.avatar,
            text: "Une analogie concrète ici pourrait bien aider les esprits visuels.",
            page: body.page,
            source: "mock",
            received_at: new Date().toISOString(),
          },
        });
      }
      throw err;
    }
  } catch (err) {
    console.error("[cockpit/sessions/[code]/whisper:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
