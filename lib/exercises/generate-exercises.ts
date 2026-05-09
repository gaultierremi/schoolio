import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  type ResponseSchema,
} from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { extractPagesFromPdf } from "@/lib/pdf/extract-pages";
import { logActivity } from "@/lib/activity/log";

const GEMINI_PRO    = "gemini-2.5-pro";
const GEMINI_FLASH  = "gemini-2.5-flash";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_PDF_BYTES = 52428800; // 50 MB — same cap as generate-questions
const MAX_TOKENS_GEMINI    = 32768;
const MAX_TOKENS_ANTHROPIC = 16000;

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Rate-limit detection ───────────────────────────────────────────────────────
// Mirrors isRateLimitError in generate-questions/route.ts — covers both Gemini
// (GoogleGenerativeAIFetchError.status === 429) and Anthropic (RateLimitError).
function isRateLimitError(error: unknown): boolean {
  if (error instanceof GoogleGenerativeAIFetchError && error.status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /rate.?limit|quota|resource.?exhausted/i.test(message);
}

// ── JSON parser (3-tier) ───────────────────────────────────────────────────────
function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) { try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ } }
  const obj = trimmed.match(/\{[\s\S]*\}/);
  if (obj?.[0]) { try { return JSON.parse(obj[0]); } catch { /* continue */ } }
  throw new Error("Impossible de parser la réponse IA comme JSON valide");
}

// ── Gemini response schema ─────────────────────────────────────────────────────
const EXERCISES_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    exercises: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title:         { type: SchemaType.STRING },
          exercise_type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["calcul", "demonstration", "analyse", "redaction", "application", "autre"],
          },
          statement:  { type: SchemaType.STRING },
          difficulty: { type: SchemaType.INTEGER },
          steps: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                step_number:       { type: SchemaType.INTEGER },
                title:             { type: SchemaType.STRING },
                content:           { type: SchemaType.STRING },
                method_or_concept: { type: SchemaType.STRING },
                is_final_answer:   { type: SchemaType.BOOLEAN },
              },
              required: ["step_number", "title", "content", "is_final_answer"],
            },
          },
        },
        required: ["title", "exercise_type", "statement", "difficulty", "steps"],
      },
    },
  },
  required: ["exercises"],
};

// ── Types ──────────────────────────────────────────────────────────────────────
type StepInput = {
  step_number: number;
  title?: string | null;
  content: string;
  method_or_concept?: string | null;
  is_final_answer?: boolean;
};

type ExerciseInput = {
  title: string;
  exercise_type?: string | null;
  statement: string;
  difficulty?: number | null;
  steps: StepInput[];
};

type AiResponse = { exercises: ExerciseInput[] };

function validateAiResponse(data: unknown): AiResponse {
  if (typeof data !== "object" || data === null)
    throw new Error("Réponse IA invalide : non-objet");
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.exercises))
    throw new Error("Réponse IA invalide : champ 'exercises' manquant");
  if (obj.exercises.length === 0)
    throw new Error("Réponse IA : aucun exercice généré");
  for (let i = 0; i < obj.exercises.length; i++) {
    const ex = obj.exercises[i] as Record<string, unknown>;
    if (typeof ex.title !== "string" || !ex.title.trim())
      throw new Error(`Exercice #${i + 1} : titre manquant`);
    if (typeof ex.statement !== "string" || !ex.statement.trim())
      throw new Error(`Exercice #${i + 1} : énoncé manquant`);
    if (!Array.isArray(ex.steps) || (ex.steps as unknown[]).length < 2)
      throw new Error(`Exercice #${i + 1} "${ex.title}" : au moins 2 étapes requises`);
  }
  return obj as AiResponse;
}

// ── Gemini call ────────────────────────────────────────────────────────────────
async function callGemini(
  modelName: string,
  pdfBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const model = gemini.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: MAX_TOKENS_GEMINI,
      responseMimeType: "application/json",
      responseSchema: EXERCISES_SCHEMA,
    },
  });

  const result = await model.generateContent([
    { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
    { text: `${systemPrompt}\n\n${userPrompt}` },
  ]);

  return result.response.text();
}

// ── Anthropic fallback call ────────────────────────────────────────────────────
async function callAnthropic(
  pdfBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  type DocumentBlock = {
    type: "document";
    source: { type: "base64"; media_type: "application/pdf"; data: string };
  };
  type TextBlock = { type: "text"; text: string };

  const content: (DocumentBlock | TextBlock)[] = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
    { type: "text", text: userPrompt },
  ];

  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS_ANTHROPIC,
    system: systemPrompt,
    messages: [{ role: "user", content: content as Anthropic.MessageParam["content"] }],
  });

  return response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");
}

// ── Fallback chain: Gemini Pro → Flash → Anthropic → error ────────────────────
async function callWithFallback(
  pdfBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; modelUsed: string }> {
  // 1. Gemini Pro
  try {
    const text = await callGemini(GEMINI_PRO, pdfBase64, systemPrompt, userPrompt);
    return { text, modelUsed: GEMINI_PRO };
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    console.log("[generate-exercises] Gemini Pro rate limit → fallback Gemini Flash");
  }

  // 2. Gemini Flash
  try {
    const text = await callGemini(GEMINI_FLASH, pdfBase64, systemPrompt, userPrompt);
    return { text, modelUsed: GEMINI_FLASH };
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    console.log("[generate-exercises] Gemini Flash rate limit → fallback Anthropic Sonnet");
  }

  // 3. Anthropic Sonnet (ultimate fallback)
  try {
    const text = await callAnthropic(pdfBase64, systemPrompt, userPrompt);
    console.log("[generate-exercises] Falling back to Anthropic Sonnet");
    return { text, modelUsed: ANTHROPIC_MODEL };
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    console.log("[generate-exercises] Anthropic also rate limited — tous les modèles saturés");
    throw new Error("ALL_MODELS_RATE_LIMITED");
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────
export type GenerateExercisesParams = {
  courseId: string;
  teacherId: string;
  courseTitle: string;
  subject: string | null;
  level: number | null;
  pdfStoragePath: string | null;
  count: number;
  pageRange?: { start: number; end: number } | null;
};

export type GenerateExercisesResult = {
  generated: number;
  exerciseIds: string[];
};

export async function generateExercises(
  params: GenerateExercisesParams
): Promise<GenerateExercisesResult> {
  const { courseId, teacherId, courseTitle, subject, level, pdfStoragePath, count } = params;
  let { pageRange } = params;

  const admin = createAdminClient();

  // ── Download PDF — same pattern as generate-questions ───────────────────────
  if (!pdfStoragePath) {
    throw new Error("Aucun PDF associé à ce cours");
  }

  const t0 = Date.now();
  const { data: pdfBlob, error: downloadError } = await admin.storage
    .from("course-pdfs")
    .download(pdfStoragePath);

  if (downloadError || !pdfBlob) {
    throw new Error("Impossible de télécharger le PDF du cours");
  }

  const fullPdfBuffer = await pdfBlob.arrayBuffer();
  const pdfSizeKB = Math.round(fullPdfBuffer.byteLength / 1024);

  if (fullPdfBuffer.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF trop volumineux (${Math.round(fullPdfBuffer.byteLength / 1024 / 1024)}MB)`);
  }

  console.log(`[generate-exercises] PDF téléchargé : ${pdfSizeKB}KB en ${Date.now() - t0}ms`);

  // Extract page subset if a range is requested, fallback to full PDF on error
  let pdfBuffer: Buffer = Buffer.from(fullPdfBuffer);
  if (pageRange) {
    try {
      const extracted = await extractPagesFromPdf({
        pdfBuffer,
        startPage: pageRange.start,
        endPage: pageRange.end,
      });
      pdfBuffer = Buffer.from(extracted);
      console.log(`[generate-exercises] Pages ${pageRange.start}–${pageRange.end} extraites (${Math.round(pdfBuffer.byteLength / 1024)}KB)`);
    } catch (err) {
      console.warn("[generate-exercises] Extraction pages échouée, fallback PDF entier:", err);
      pageRange = null;
    }
  }

  const pdfBase64 = pdfBuffer.toString("base64");

  // ── Build prompts ────────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(subject);
  const baseUserPrompt = buildUserPrompt({ courseTitle, subject, level, count });
  const pageRangeSuffix = pageRange
    ? ` Le contenu fourni correspond aux pages ${pageRange.start} à ${pageRange.end} du document original.`
    : "";
  const userPrompt = baseUserPrompt + pageRangeSuffix;

  console.log(
    `[generate-exercises] Génération — cours: "${courseTitle}", matière: ${subject ?? "N/A"}, niveau: ${level ?? "N/A"}, count: ${count}`
  );

  // ── AI call with fallback chain ──────────────────────────────────────────────
  const t1 = Date.now();
  const { text: rawText, modelUsed } = await callWithFallback(pdfBase64, systemPrompt, userPrompt);
  console.log(
    `[generate-exercises] Réponse reçue via ${modelUsed} en ${Date.now() - t1}ms (${rawText.length} chars)`
  );

  // ── Parse + validate ─────────────────────────────────────────────────────────
  const parsed = parseJsonResponse(rawText);
  const validated = validateAiResponse(parsed);
  console.log(`[generate-exercises] ${validated.exercises.length} exercices parsés, insertion en DB...`);

  // ── Insert exercises + steps ─────────────────────────────────────────────────
  const exerciseIds: string[] = [];

  for (const ex of validated.exercises) {
    const { data: inserted, error: exErr } = await admin
      .from("exercises")
      .insert({
        course_id:          courseId,
        teacher_id:         teacherId,
        title:              ex.title.slice(0, 80),
        statement:          ex.statement,
        exercise_type:      ex.exercise_type ?? null,
        subject_enum:       subject,
        level:              level ?? null,
        difficulty:         ex.difficulty ?? null,
        status:             "pending",
        generated_by_model: modelUsed,
        page_range_start:   pageRange?.start ?? null,
        page_range_end:     pageRange?.end ?? null,
      })
      .select("id")
      .single();

    if (exErr || !inserted) {
      console.error(`[generate-exercises] Erreur insertion exercice "${ex.title}":`, exErr);
      continue;
    }

    exerciseIds.push(inserted.id);

    const stepRows = (ex.steps as StepInput[]).map((s, i) => ({
      exercise_id:       inserted.id,
      step_number:       typeof s.step_number === "number" ? s.step_number : i + 1,
      title:             s.title ?? null,
      content:           s.content,
      method_or_concept: s.method_or_concept ?? null,
      is_final_answer:   s.is_final_answer === true,
    }));

    const { error: stepsErr } = await admin.from("exercise_steps").insert(stepRows);
    if (stepsErr) {
      console.error(`[generate-exercises] Erreur steps pour ${inserted.id}:`, stepsErr);
    } else {
      console.log(`[generate-exercises] "${ex.title}" → ${stepRows.length} étapes (difficulté ${ex.difficulty ?? "N/A"})`);
    }
  }

  console.log(
    `[generate-exercises] Terminé : ${exerciseIds.length}/${validated.exercises.length} exercices insérés en ${Date.now() - t0}ms total`
  );

  if (pageRange) {
    await logActivity({
      event_type: "teacher_generated_targeted_exercises",
      actor_id: teacherId,
      actor_type: "teacher",
      target_type: "course",
      target_id: courseId,
      teacher_id: teacherId,
      context: { count: exerciseIds.length, page_range: pageRange },
    });
  }

  return { generated: exerciseIds.length, exerciseIds };
}
