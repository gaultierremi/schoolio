import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const anthropic = new Anthropic();

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Prompt (duplicated from /api/extract-questions — no shared abstraction needed) ──

const THEME_INSTRUCTIONS: Partial<Record<SubjectId, string>> = {
  histoire:
    "Pour le champ period, utilise l'une de ces périodes : Préhistoire, Antiquité, Moyen Âge, Renaissance, XVIe siècle, XVIIe siècle, XVIIIe siècle, XIXe siècle, XXe siècle, XXIe siècle, Autre.",
  chimie:
    "Pour le champ period, utilise l'un de ces thèmes : Atomes et molécules, Réactions chimiques, Stœchiométrie, Acides et bases, Chimie organique, Liaisons chimiques, Tableau périodique, Autre.",
  physique:
    "Pour le champ period, utilise l'un de ces thèmes : Mécanique, Énergie, Électricité, Optique, Thermodynamique, Ondes, Autre.",
  biologie:
    "Pour le champ period, utilise l'un de ces thèmes : Cellule, Génétique, Évolution, Écosystèmes, Anatomie humaine, Physiologie, Autre.",
};

function getLevelInstruction(level: SchoolLevel | null): string {
  if (!level) return "";
  if (level <= 2)
    return "Cours de début de secondaire (élèves 12-14 ans). Vocabulaire et notions fondamentales, questions directes et concrètes.";
  if (level <= 4)
    return "Cours de milieu de secondaire (élèves 14-16 ans). Compréhension, applications de concepts, mises en contexte.";
  return "Cours de fin de secondaire (élèves 16-18 ans). Analyse, synthèse, raisonnement, questions à plusieurs étapes.";
}

function buildSystemPrompt(subject: SubjectId, level: SchoolLevel | null): string {
  const subjectLabel = SUBJECTS_BY_ID[subject].label;
  const levelInstruction = getLevelInstruction(level);
  const themeInstruction =
    THEME_INSTRUCTIONS[subject] ??
    "Pour le champ period, identifie le thème principal de chaque question dans le document.";
  const levelClause = levelInstruction ? ` ${levelInstruction}` : "";
  return (
    `Tu es un assistant pédagogique. Analyse ce document et génère des questions de quiz pertinentes pour un cours de ${subjectLabel}.${levelClause}` +
    ` Réponds UNIQUEMENT en JSON valide avec ce format exact :` +
    ` {"page_count": 12, "questions": [{"type": "mcq", "question": "...", "options": ["A", "B", "C", "D"], "answer_index": 0, "explanation": "...", "period": "..."},` +
    ` {"type": "truefalse", "question": "...", "options": ["Vrai", "Faux"], "answer_index": 0, "explanation": "...", "period": "..."}]}.` +
    ` Génère entre 5 et 15 questions variées (mix QCM et Vrai/Faux). Les questions doivent être claires, pédagogiques et directement liées au contenu du document.` +
    ` ${themeInstruction}` +
    ` Dans le champ page_count, indique le nombre total de pages du document.`
  );
}

type ExtractedQuestion = {
  type: "mcq" | "truefalse";
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
  period: string;
};

type CourseRow = {
  id: string;
  teacher_id: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  organization_tags: string[] | null;
};

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses/generate-questions]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );
    if (teacherError) {
      console.error("[courses/generate-questions]", teacherError);
      return NextResponse.json({ error: "Erreur de vérification professeur" }, { status: 500 });
    }
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = (await request.json()) as { courseId?: unknown; questionsCount?: unknown };
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const questionsCount =
      typeof body.questionsCount === "number" && body.questionsCount > 0
        ? Math.min(body.questionsCount, 25)
        : 10;

    if (!UUID_REGEX.test(courseId)) {
      return NextResponse.json({ error: "courseId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ── Fetch course ──────────────────────────────────────────────────────────
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, teacher_id, subject_enum, level, pdf_storage_path, organization_tags")
      .eq("id", courseId)
      .limit(1)
      .maybeSingle();

    if (courseError) throw courseError;
    if (!course) {
      return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    }

    const typedCourse = course as CourseRow;

    if (typedCourse.teacher_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (!typedCourse.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF associé à ce cours" }, { status: 400 });
    }

    // ── Download PDF ──────────────────────────────────────────────────────────
    const { data: pdfBlob, error: downloadError } = await admin.storage
      .from("course-pdfs")
      .download(typedCourse.pdf_storage_path);

    if (downloadError || !pdfBlob) {
      console.error("[courses/generate-questions]", downloadError);
      return NextResponse.json({ error: "Impossible de télécharger le PDF" }, { status: 500 });
    }

    const pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString("base64");

    // ── Resolve subject/level ─────────────────────────────────────────────────
    const subject: SubjectId = isValidSubject(typedCourse.subject_enum)
      ? typedCourse.subject_enum
      : "histoire";
    const level: SchoolLevel | null = isValidLevel(typedCourse.level)
      ? typedCourse.level
      : null;

    // ── Call Claude ───────────────────────────────────────────────────────────
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: buildSystemPrompt(subject, level),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            {
              type: "text",
              text: `Génère ${questionsCount} questions de quiz basées sur ce document.`,
            },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Réponse invalide du modèle" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      questions: ExtractedQuestion[];
      page_count?: number;
    };

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json({ error: "Aucune question générée" }, { status: 500 });
    }

    // ── INSERT teacher_questions ──────────────────────────────────────────────
    const rows = parsed.questions.map((q) => ({
      teacher_id: user.id,
      course_id: courseId,
      subject: null,
      subject_enum: typedCourse.subject_enum ?? null,
      level: typedCourse.level ?? null,
      type: q.type,
      question: q.question,
      options: q.options,
      answer_index: q.answer_index,
      explanation: q.explanation || null,
      period: q.period || null,
      organization_tags: typedCourse.organization_tags ?? [],
      is_ai_generated: true,
      is_public: false,
    }));

    const { error: insertError } = await admin.from("teacher_questions").insert(rows);
    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      questionsGenerated: rows.length,
      courseId,
    });
  } catch (error) {
    console.error("[courses/generate-questions]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
