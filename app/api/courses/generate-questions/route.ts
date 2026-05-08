import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  type ResponseSchema,
} from "@google/generative-ai";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// LEGACY ANTHROPIC IMPLEMENTATION (kept for reference)
/*
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic();
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: buildSystemPrompt(subject, level),
  messages: [{
    role: "user",
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
      { type: "text", text: `Genere ${questionsCount} questions de quiz basees sur ce document.` },
    ],
  }],
});
*/

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const MAX_PDF_BYTES = 52428800;
const WORKER_COUNT = 3;
const QUESTIONS_PER_WORKER = 10;
const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const THEME_INSTRUCTIONS: Partial<Record<SubjectId, string>> = {
  histoire:
    "Pour le champ period, utilise l'une de ces periodes : Prehistoire, Antiquite, Moyen Age, Renaissance, XVIe siecle, XVIIe siecle, XVIIIe siecle, XIXe siecle, XXe siecle, XXIe siecle, Autre.",
  chimie:
    "Pour le champ period, utilise l'un de ces themes : Atomes et molecules, Reactions chimiques, Stoechiometrie, Acides et bases, Chimie organique, Liaisons chimiques, Tableau periodique, Autre.",
  physique:
    "Pour le champ period, utilise l'un de ces themes : Mecanique, Energie, Electricite, Optique, Thermodynamique, Ondes, Autre.",
  biologie:
    "Pour le champ period, utilise l'un de ces themes : Cellule, Genetique, Evolution, Ecosystemes, Anatomie humaine, Physiologie, Autre.",
};

function getLevelInstruction(level: SchoolLevel | null): string {
  if (!level) return "";
  if (level <= 2) {
    return "Cours de debut de secondaire (eleves 12-14 ans). Vocabulaire et notions fondamentales, questions directes et concretes.";
  }
  if (level <= 4) {
    return "Cours de milieu de secondaire (eleves 14-16 ans). Comprehension, applications de concepts, mises en contexte.";
  }
  return "Cours de fin de secondaire (eleves 16-18 ans). Analyse, synthese, raisonnement, questions a plusieurs etapes.";
}

function buildSystemPrompt(subject: SubjectId, level: SchoolLevel | null): string {
  const subjectLabel = SUBJECTS_BY_ID[subject].label;
  const levelInstruction = getLevelInstruction(level);
  const themeInstruction =
    THEME_INSTRUCTIONS[subject] ??
    "Pour le champ period, identifie le theme principal de chaque question dans le document.";
  const levelClause = levelInstruction ? ` ${levelInstruction}` : "";

  return (
    `Tu es un assistant pedagogique. Analyse ce document et genere des questions de quiz pertinentes pour un cours de ${subjectLabel}.${levelClause}` +
    ` Reponds UNIQUEMENT en JSON valide avec ce format exact :` +
    ` {"page_count": 12, "questions": [{"type": "mcq", "question": "...", "options": ["A", "B", "C", "D"], "answer_index": 0, "explanation": "...", "period": "...", "difficulty": 2}]}.` +
    ` Genere uniquement des QCM avec exactement 4 choix. answer_index doit etre entre 0 et 3. difficulty doit etre 1, 2 ou 3.` +
    ` Les questions doivent etre claires, pedagogiques, variees et directement liees au contenu du document.` +
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
  difficulty?: number;
};

type CourseRow = {
  id: string;
  teacher_id: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  organization_tags: string[] | null;
};

const QUESTIONS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    page_count: { type: SchemaType.INTEGER },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, format: "enum", enum: ["mcq"] },
          question: { type: SchemaType.STRING },
          options: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          answer_index: { type: SchemaType.INTEGER },
          explanation: { type: SchemaType.STRING },
          period: { type: SchemaType.STRING },
          difficulty: { type: SchemaType.INTEGER },
        },
        required: ["type", "question", "options", "answer_index", "explanation", "period", "difficulty"],
      },
    },
  },
  required: ["page_count", "questions"],
};

function isRateLimitError(error: unknown) {
  if (error instanceof GoogleGenerativeAIFetchError && error.status === 429) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /rate.?limit|quota|resource.?exhausted/i.test(message);
}

function parseJsonObject<T>(rawText: string): T {
  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {}
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    return JSON.parse(jsonMatch[0]) as T;
  }

  throw new Error("Reponse JSON invalide");
}

async function generateGeminiQuestions(
  modelName: string,
  pdfBase64: string,
  systemPrompt: string,
  workerIndex: number
) {
  const model = gemini.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
      responseSchema: QUESTIONS_SCHEMA,
    },
  });

  const result = await model.generateContent([
    { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
    {
      text:
        `${systemPrompt}\n\n` +
        `Worker ${workerIndex + 1}/${WORKER_COUNT}: genere ${QUESTIONS_PER_WORKER} QCM distincts. ` +
        `Evite les doublons et couvre une partie differente du document.`,
    },
  ]);

  return result.response.text();
}

async function generateQuestionsWithFallback(
  pdfBase64: string,
  systemPrompt: string,
  workerIndex: number
) {
  try {
    return await generateGeminiQuestions("gemini-2.5-pro", pdfBase64, systemPrompt, workerIndex);
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
  }

  try {
    return await generateGeminiQuestions("gemini-2.5-flash", pdfBase64, systemPrompt, workerIndex);
  } catch (error) {
    if (isRateLimitError(error)) throw new Error("GEMINI_RATE_LIMIT");
    throw error;
  }
}

function normalizeQuestion(question: ExtractedQuestion): ExtractedQuestion {
  const options = Array.isArray(question.options) ? question.options.slice(0, 4) : [];
  while (options.length < 4) options.push("");

  const answerIndex =
    Number.isInteger(question.answer_index) && question.answer_index >= 0 && question.answer_index <= 3
      ? question.answer_index
      : 0;
  const rawDifficulty = question.difficulty;
  const difficulty =
    typeof rawDifficulty === "number" &&
    Number.isInteger(rawDifficulty) &&
    rawDifficulty >= 1 &&
    rawDifficulty <= 3
      ? rawDifficulty
      : undefined;

  return {
    type: "mcq",
    question: typeof question.question === "string" ? question.question : "",
    options,
    answer_index: answerIndex,
    explanation: typeof question.explanation === "string" ? question.explanation : "",
    period: typeof question.period === "string" ? question.period : "",
    difficulty,
  };
}

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );
    if (teacherError) {
      console.error("[courses/generate-questions]", teacherError);
      return NextResponse.json({ error: "Erreur de verification professeur" }, { status: 500 });
    }
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const body = (await request.json()) as { courseId?: unknown; questionsCount?: unknown };
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const questionsCount =
      typeof body.questionsCount === "number" && body.questionsCount > 0
        ? Math.min(body.questionsCount, 30)
        : 30;

    if (!UUID_REGEX.test(courseId)) {
      return NextResponse.json({ error: "courseId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

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
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }
    if (!typedCourse.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF associe a ce cours" }, { status: 400 });
    }

    const { data: pdfBlob, error: downloadError } = await admin.storage
      .from("course-pdfs")
      .download(typedCourse.pdf_storage_path);

    if (downloadError || !pdfBlob) {
      console.error("[courses/generate-questions]", downloadError);
      return NextResponse.json({ error: "Impossible de telecharger le PDF" }, { status: 500 });
    }

    const pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString("base64");
    if (Buffer.byteLength(pdfBase64, "base64") > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF trop volumineux" }, { status: 400 });
    }

    const subject: SubjectId = isValidSubject(typedCourse.subject_enum)
      ? typedCourse.subject_enum
      : "histoire";
    const level: SchoolLevel | null = isValidLevel(typedCourse.level)
      ? typedCourse.level
      : null;
    const systemPrompt = buildSystemPrompt(subject, level);

    const workerOutputs = await Promise.all(
      Array.from({ length: WORKER_COUNT }, (_, workerIndex) =>
        generateQuestionsWithFallback(pdfBase64, systemPrompt, workerIndex)
      )
    );

    const parsedOutputs = workerOutputs.map((rawText) =>
      parseJsonObject<{ questions: ExtractedQuestion[]; page_count?: number }>(rawText)
    );
    const questions = parsedOutputs
      .flatMap((output) => (Array.isArray(output.questions) ? output.questions : []))
      .map(normalizeQuestion)
      .filter((question) => question.question && question.options.every(Boolean))
      .slice(0, questionsCount);

    if (questions.length === 0) {
      return NextResponse.json({ error: "Aucune question generee" }, { status: 500 });
    }

    const rows = questions.map((q) => ({
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
      difficulty_stars: q.difficulty ?? null,
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
    if (error instanceof Error && error.message === "GEMINI_RATE_LIMIT") {
      return NextResponse.json({ error: "Service temporairement sature" }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
