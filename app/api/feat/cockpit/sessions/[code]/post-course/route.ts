import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePostCourseDoc, generatePersonalizedAssignment } from "@/lib/cockpit/question-prompt";
import { MOCK_STUDENTS } from "@/types/post-course";
import type { DemoPdfKey, PostCourseDocType } from "@/types/post-course";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CODE_RE = /^[A-Z2-9]{6}$/;
const VALID_TYPES: PostCourseDocType[] = ["summary", "quiz", "flashcards", "homework"];

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET → generate a post-course document for the given session
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  const type = req.nextUrl.searchParams.get("type") as PostCourseDocType | null;
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "type invalide (summary|quiz|flashcards|homework)" }, { status: 400 });
  }

  try {
    const { data: session, error } = await admin()
      .from("cockpit_sessions")
      .select("pdf_key, transcript")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (error) throw error;
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const pdfKey = session.pdf_key as DemoPdfKey;
    const transcript = (session.transcript as string) ?? "";

    if (type === "homework") {
      const assignments = await Promise.all(
        MOCK_STUDENTS.map(async (student) => ({
          student,
          assignment: await generatePersonalizedAssignment({ pdfKey, transcript, student }),
          generated_at: new Date().toISOString(),
        })),
      );
      return NextResponse.json({ type, assignments });
    }

    const content = await generatePostCourseDoc({ pdfKey, transcript, type });
    return NextResponse.json({
      type,
      doc: { type, content, generated_at: new Date().toISOString() },
    });
  } catch (err) {
    console.error("[cockpit/sessions/[code]/post-course:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
