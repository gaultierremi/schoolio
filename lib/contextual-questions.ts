import { SupabaseClient } from "@supabase/supabase-js";
import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { PDFDocument } from "pdf-lib";
import { routeAIRequest } from "./ai-router";

const LIVE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
          options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          answer_index: { type: SchemaType.INTEGER },
          explanation: { type: SchemaType.STRING },
          page_start: { type: SchemaType.INTEGER },
          page_end: { type: SchemaType.INTEGER },
        },
        required: ["question", "options", "answer_index"],
      },
    },
  },
  required: ["questions"],
};

type GeminiQuestion = {
  question: string;
  options: string[];
  answer_index: number;
  explanation?: string;
  page_start?: number;
  page_end?: number;
};

export type ContextualQuestion = {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
  origin: "ai_generated" | "extracted_from_pdf" | "ai_live";
  page_range_start: number | null;
  page_range_end: number | null;
};

export async function getContextualQuestions(
  admin: SupabaseClient,
  courseId: string,
  currentPage: number,
  pageRadius = 5,
): Promise<ContextualQuestion[]> {
  const lo = Math.max(1, currentPage - pageRadius);
  const hi = currentPage + pageRadius;

  const { data, error } = await admin
    .from("teacher_questions")
    .select("id, question, options, answer_index, explanation, origin, page_range_start, page_range_end")
    .eq("course_id", courseId)
    // Sprint 2B : double-gate (validated_at + is_active). Le validation route
    // maintient les deux en parallèle. Sprint 2C dropera validated_at.
    .not("validated_at", "is", null)
    .is("rejected_at", null)
    .eq("is_active", true)
    .or(`page_range_start.is.null,and(page_range_start.lte.${hi},page_range_end.gte.${lo})`)
    .order("page_range_start", { ascending: true, nullsFirst: false })
    .limit(30);

  if (error || !data) return [];

  return data.map((q) => ({
    id: q.id as string,
    question: q.question as string,
    options: q.options as string[],
    answer_index: q.answer_index as number,
    explanation: q.explanation as string | null,
    origin: q.origin as "ai_generated" | "extracted_from_pdf" | "ai_live",
    page_range_start: q.page_range_start as number | null,
    page_range_end: q.page_range_end as number | null,
  }));
}

async function extractPageRange(pdfBuffer: Buffer, currentPage: number): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = srcDoc.getPageCount();
  // currentPage is 1-indexed; extract ±2 pages (up to 5 pages)
  const zeroIdx = currentPage - 1;
  const startIdx = Math.max(0, zeroIdx - 2);
  const endIdx = Math.min(pageCount - 1, zeroIdx + 2);

  const destDoc = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = startIdx; i <= endIdx; i++) indices.push(i);

  const copied = await destDoc.copyPages(srcDoc, indices);
  for (const page of copied) destDoc.addPage(page);

  return Buffer.from(await destDoc.save());
}

export async function generateLiveQuestions(
  admin: SupabaseClient,
  teacherId: string,
  courseId: string,
  currentPage: number,
  pdfBuffer: Buffer,
): Promise<ContextualQuestion[]> {
  const pageBuffer = await extractPageRange(pdfBuffer, currentPage);
  const pdfBase64 = pageBuffer.toString("base64");

  const prompt =
    "Tu es un assistant pédagogique. Génère 3 à 5 questions QCM (4 options chacune, une seule bonne réponse) " +
    "basées sur le contenu visible dans ces pages du cours. " +
    "Les questions doivent tester la compréhension du contenu de ces pages spécifiquement. " +
    "Pour chaque question, indique les numéros de page (page_start, page_end) de la matière concernée. " +
    "Réponds UNIQUEMENT avec le JSON demandé.";

  const aiResponse = await routeAIRequest("live_contextual_questions", prompt, {
    pdfBase64,
    requireVision: true,
    responseSchema: LIVE_SCHEMA,
    maxTokens: 8192,
    cacheTtlMs: 0,
  });
  const raw = aiResponse.text;
  let parsed: { questions: GeminiQuestion[] };
  try {
    parsed = JSON.parse(raw) as { questions: GeminiQuestion[] };
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    parsed = JSON.parse(match[0]) as { questions: GeminiQuestion[] };
  }

  const questions = (parsed.questions ?? []).filter(
    (q) => q.question && Array.isArray(q.options) && q.options.length >= 2,
  );

  if (questions.length === 0) return [];

  const now = new Date().toISOString();
  const rows = questions.map((q) => ({
    teacher_id: teacherId,
    course_id: courseId,
    type: "mcq" as const,
    question: q.question,
    options: q.options.slice(0, 4),
    answer_index: Math.max(0, Math.min(q.answer_index, q.options.length - 1)),
    explanation: q.explanation ?? null,
    is_ai_generated: true,
    is_public: false,
    origin: "ai_live",
    validated_at: now,
    // Sprint 2B : les questions ai_live insérées via ce flow sont déjà
    // implicitement validées (le prof a déclenché un live), donc is_active=true.
    is_active: true,
    page_range_start: q.page_start ?? currentPage,
    page_range_end: q.page_end ?? currentPage,
  }));

  const { data: inserted, error } = await admin
    .from("teacher_questions")
    .insert(rows)
    .select("id, question, options, answer_index, explanation, origin, page_range_start, page_range_end");

  if (error || !inserted) return [];

  return inserted.map((q) => ({
    id: q.id as string,
    question: q.question as string,
    options: q.options as string[],
    answer_index: q.answer_index as number,
    explanation: q.explanation as string | null,
    origin: "ai_live" as const,
    page_range_start: q.page_range_start as number | null,
    page_range_end: q.page_range_end as number | null,
  }));
}
