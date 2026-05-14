import { createClient } from "@supabase/supabase-js";
import { routeAIRequest } from "@/lib/ai-router";
import { DEMO_PDFS } from "@/lib/cockpit/session";
import type { DemoPdfKey } from "@/types/post-course";

// Shared ContextualQuestion type — UI (TeacherCockpitMobile, QuestionFlowModal) depends on this shape
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

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Read existing questions from cockpit_questions for the current page range
export async function getContextualQuestions(
  _unusedClient: unknown,
  sessionCode: string,
  currentPage: number,
  pageRadius = 5,
): Promise<ContextualQuestion[]> {
  const lo = Math.max(1, currentPage - pageRadius);
  const hi = currentPage + pageRadius;

  const { data, error } = await admin()
    .from("cockpit_questions")
    .select("id, question, options, answer_index, explanation, origin, page_start, page_end")
    .eq("session_code", sessionCode)
    .or(`page_start.is.null,and(page_start.lte.${hi},page_end.gte.${lo})`)
    .order("page_start", { ascending: true, nullsFirst: false })
    .limit(20);

  if (error || !data) return [];

  return data.map((q) => ({
    id: q.id as string,
    question: q.question as string,
    options: q.options as string[],
    answer_index: q.answer_index as number,
    explanation: q.explanation as string | null,
    origin: (q.origin as string) as ContextualQuestion["origin"],
    page_range_start: q.page_start as number | null,
    page_range_end: q.page_end as number | null,
  }));
}

// Generate QCM questions via AI router and persist in cockpit_questions
export async function generateLiveQuestions(
  _unusedClient: unknown,
  _unusedTeacherId: string,
  sessionCode: string,
  currentPage: number,
  pdfKey: DemoPdfKey,
  transcript: string,
): Promise<ContextualQuestion[]> {
  const pdf = DEMO_PDFS.find((p) => p.key === pdfKey);
  if (!pdf) return [];

  const contextLine =
    transcript.trim().length > 20
      ? `Extrait du cours (60 dernières secondes) : «${transcript.slice(-600)}»`
      : `(pas de transcript disponible pour cette page)`;

  const prompt = `Tu es un assistant pédagogique qui génère des QCM pour un cours en direct.

Matière : ${pdf.title} — ${pdf.subject}
Page courante : ${currentPage}
${contextLine}

Génère 3 questions QCM Socratiques (4 options chacune, une seule bonne réponse) adaptées à la page courante.
Les questions doivent tester la compréhension du concept central de cette page.

Réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :
{
  "questions": [
    {
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer_index": 0,
      "explanation": "..."
    }
  ]
}`;

  let parsed: { questions: Array<{ question: string; options: string[]; answer_index: number; explanation?: string }> };

  try {
    const res = await routeAIRequest("cockpit_qcm_generation", prompt, {
      maxTokens: 1200,
      temperature: 0.6,
      jsonMode: true,
      cacheTtlMs: 0,
    });

    const raw = res.text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    return [];
  }

  const questions = (parsed?.questions ?? []).filter(
    (q) => q.question && Array.isArray(q.options) && q.options.length >= 2,
  );
  if (questions.length === 0) return [];

  const rows = questions.map((q) => ({
    session_code: sessionCode,
    page_start: currentPage,
    page_end: currentPage,
    question: q.question,
    options: q.options.slice(0, 4),
    answer_index: Math.max(0, Math.min(q.answer_index ?? 0, q.options.length - 1)),
    explanation: q.explanation ?? null,
    origin: "ai_live",
  }));

  const { data: inserted, error } = await admin()
    .from("cockpit_questions")
    .insert(rows)
    .select("id, question, options, answer_index, explanation, origin, page_start, page_end");

  if (error || !inserted) return [];

  return inserted.map((q) => ({
    id: q.id as string,
    question: q.question as string,
    options: q.options as string[],
    answer_index: q.answer_index as number,
    explanation: q.explanation as string | null,
    origin: "ai_live" as const,
    page_range_start: q.page_start as number | null,
    page_range_end: q.page_end as number | null,
  }));
}
