import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { routeAIRequest } from "@/lib/ai-router";
import { buildListenPrompt, type ListenPromptResponse, type ListenQuestion } from "@/lib/listen-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const RATE_LIMIT_MS = 20_000;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function isValidQuestion(q: unknown): q is ListenQuestion {
  if (!q || typeof q !== "object") return false;
  const obj = q as Record<string, unknown>;
  return (
    typeof obj.question === "string" && obj.question.trim().length > 0 &&
    Array.isArray(obj.options) && obj.options.length >= 2 &&
    typeof obj.answer_index === "number" &&
    Number.isInteger(obj.answer_index) &&
    obj.answer_index >= 0 &&
    obj.answer_index < (obj.options as unknown[]).length &&
    (obj.type === "mcq" || obj.type === "truefalse")
  );
}

// POST /api/live-sessions/[id]/listen-suggestions
// Body: { transcript: string, pageNumber?: number }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: "sessionId invalide" }, { status: 400 });
    }

    const body = (await req.json()) as { transcript?: string; pageNumber?: number };
    const transcript = body.transcript?.trim() ?? "";
    const pageNumber = typeof body.pageNumber === "number" ? Math.max(1, Math.round(body.pageNumber)) : null;

    if (!transcript) {
      return NextResponse.json({ error: "transcript requis" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify session ownership
    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, course_id, ended_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.teacher_id !== user.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    const courseId = session.course_id as string;

    // Rate-limit: check most recent ai_listen insert for this course
    const { data: lastInsert } = await admin
      .from("teacher_questions")
      .select("created_at")
      .eq("course_id", courseId)
      .eq("origin", "ai_listen")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastInsert?.created_at) {
      const elapsed = Date.now() - new Date(lastInsert.created_at as string).getTime();
      if (elapsed < RATE_LIMIT_MS) {
        return NextResponse.json(
          { error: "Requête trop rapide — attends quelques secondes" },
          { status: 429 },
        );
      }
    }

    // Fetch course context
    const { data: course } = await admin
      .from("courses")
      .select("title, subject, level")
      .eq("id", courseId)
      .maybeSingle();

    const subject = (course?.subject as string | null) ?? "Matière inconnue";
    const level = (course?.level as string | null) ?? "Niveau inconnu";
    const courseTitle = (course?.title as string | null) ?? "Sans titre";

    // Build prompt and call AI
    const prompt = buildListenPrompt({
      transcript,
      subject,
      level,
      courseTitle,
      currentPage: pageNumber,
    });

    const aiResponse = await routeAIRequest("live_listen_suggestions", prompt, {
      jsonMode: true,
      cacheTtlMs: 0,
      maxTokens: 2048,
    });

    // Parse AI response
    let parsed: ListenPromptResponse | null = null;
    try {
      parsed = JSON.parse(aiResponse.text) as ListenPromptResponse;
    } catch {
      const match = aiResponse.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]) as ListenPromptResponse;
        } catch {
          // leave parsed as null
        }
      }
    }

    const rawQuestions: unknown[] = parsed?.questions ?? [];
    const validQuestions = rawQuestions.filter(isValidQuestion);

    if (validQuestions.length < 3) {
      console.warn(
        `[listen-suggestions] Gemini returned ${validQuestions.length}/3 valid questions for session ${params.id}. ` +
        `Raw response length: ${aiResponse.text.length}`,
      );
    }

    if (validQuestions.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Insert valid questions into teacher_questions
    const rows = validQuestions.map((q) => ({
      teacher_id: user.id,
      course_id: courseId,
      type: q.type === "truefalse" ? "truefalse" : "mcq",
      question: q.question,
      options: q.options.slice(0, 4),
      answer_index: q.answer_index,
      explanation: q.explanation ?? null,
      is_ai_generated: true,
      is_public: false,
      origin: "ai_listen",
      concept_page_hint: pageNumber,
      validated_at: null,
    }));

    const { data: inserted, error: insertError } = await admin
      .from("teacher_questions")
      .insert(rows)
      .select("id, question, type, options, answer_index, explanation, concept_page_hint");

    if (insertError || !inserted) {
      console.error("[listen-suggestions] Insert failed:", insertError);
      return NextResponse.json({ error: "Erreur lors de l'enregistrement des questions" }, { status: 500 });
    }

    return NextResponse.json({ suggestions: inserted });
  } catch (err) {
    console.error("[live-sessions/[id]/listen-suggestions:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
