import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { routeAIRequest, GracefulAIError } from "@/lib/ai-router";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { isValidSubject, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";
import {
  inferConceptsFromQuestion,
  tagQuestionWithConcepts,
} from "@/lib/concepts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_TOPIC_LENGTH = 500;

type GeneratedQuestion = {
  type: "mcq" | "truefalse";
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
  period: string;
};

type PersistedQuestion = GeneratedQuestion & { id: string };

const SUBJECT_INSTRUCTIONS: Partial<Record<SubjectId, string>> = {
  histoire:
    "Génère des questions sur des événements historiques, des personnages et des contextes géopolitiques. Inclus dates clés et conséquences.",
  chimie:
    "Génère des questions sur atomes, molécules, réactions chimiques, stœchiométrie, acides/bases et chimie organique.",
  physique:
    "Génère des questions sur mécanique, énergie, électricité, optique, thermodynamique et ondes.",
  biologie:
    "Génère des questions sur cellules, génétique, évolution, écosystèmes, anatomie humaine et physiologie.",
  sciences:
    "Génère des questions scientifiques transverses (physique, chimie, biologie). Couvre phénomènes, expériences et découvertes.",
  mathematiques:
    "Génère des problèmes mathématiques avec des énoncés précis et des résultats exacts. Couvre algèbre, géométrie, probabilités et analyse.",
  geographie:
    "Génère des questions sur des pays, capitales, reliefs, fleuves, densités et géographie humaine et physique.",
  litterature:
    "Génère des questions sur des œuvres majeures, leurs auteurs, les mouvements littéraires et les genres.",
  francais:
    "Génère des questions sur grammaire, conjugaison, vocabulaire, expressions et littérature française.",
  anglais:
    "Génère des questions de vocabulaire, grammaire, conjugaison et expressions idiomatiques anglaises.",
  neerlandais:
    "Génère des questions de vocabulaire, grammaire et expressions idiomatiques néerlandaises.",
  droit:
    "Génère des cas pratiques et questions sur le droit positif. Couvre droit civil, pénal, constitutionnel et du travail.",
  medecine:
    "Génère des questions cliniques et anatomiques rigoureuses. Couvre anatomie, physiologie, sémiologie, pathologies et traitements.",
  permis:
    "Génère des questions de code de la route avec des situations réalistes. Inclus signalisation, priorités, distances de freinage et sécurité.",
  langues:
    "Génère des questions de vocabulaire, grammaire et expressions. Adapte la langue au sujet fourni.",
  autre:
    "Génère des questions pédagogiques variées, claires et pertinentes par rapport au sujet fourni.",
};

function buildSystemPrompt(
  subjectId: SubjectId,
  count: number,
  difficulty: number,
): string {
  const subjectLabel = SUBJECTS_BY_ID[subjectId].label;
  const instruction =
    SUBJECT_INSTRUCTIONS[subjectId] ?? SUBJECT_INSTRUCTIONS.autre!;
  const difficultyLabel =
    difficulty === 1 ? "débutant" : difficulty === 2 ? "intermédiaire" : "expert";

  return `Tu es un assistant pédagogique expert en ${subjectLabel}. ${instruction}
Génère exactement ${count} questions de niveau ${difficultyLabel} (mix QCM et Vrai/Faux). Réponds UNIQUEMENT en JSON valide :
{"questions":[{"type":"mcq","question":"...","options":["A","B","C","D"],"answer_index":0,"explanation":"...","period":"..."},{"type":"truefalse","question":"...","options":["Vrai","Faux"],"answer_index":0,"explanation":"...","period":"..."}]}
Règles : options correctement ordonnées, answer_index correspond à la bonne réponse, explication courte et pédagogique, period = période/domaine pertinent ou "Général".`;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      pdfBase64?: unknown;
      topic?: unknown;
      subject?: unknown;
      count?: unknown;
      difficulty?: unknown;
    };

    const pdfBase64 =
      typeof body.pdfBase64 === "string" ? body.pdfBase64 : undefined;
    const topic =
      typeof body.topic === "string" ? body.topic.trim() : undefined;
    const subject = body.subject;
    const count = Math.min(
      Math.max(typeof body.count === "number" ? body.count : 10, 1),
      25,
    );
    const difficulty = Math.min(
      Math.max(typeof body.difficulty === "number" ? body.difficulty : 1, 1),
      3,
    );

    if (!pdfBase64 && !topic) {
      return apiError("PDF ou sujet (topic) requis", 400);
    }
    if (!isValidSubject(subject)) {
      return apiError("Matière invalide", 400);
    }
    if (topic && topic.length > MAX_TOPIC_LENGTH) {
      return apiError("Sujet trop long (max 500 caractères)", 400);
    }
    if (pdfBase64 && Buffer.byteLength(pdfBase64, "base64") > MAX_PDF_BYTES) {
      return apiError("PDF trop volumineux (max 50 Mo)", 400);
    }

    const cacheInput = pdfBase64
      ? pdfBase64.slice(0, 2000)
      : `${subject}:${topic}:${count}:${difficulty}`;
    const cacheKey = createHash("sha256").update(cacheInput).digest("hex");

    const db = adminClient();

    const { data: cached } = await db
      .from("generated_questions_cache")
      .select("questions")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.questions) {
      const questions = (cached.questions as PersistedQuestion[]).slice(0, count);
      return apiOk({ questions, cached: true });
    }

    const systemPrompt = buildSystemPrompt(subject, count, difficulty);
    const userPrompt = pdfBase64
      ? `Génère ${count} questions à partir de ce document.`
      : `Sujet : "${topic}"\nGénère ${count} questions sur ce sujet.`;

    const aiResponse = await routeAIRequest(
      pdfBase64 ? "generate_pdf_questions" : "generate_topic_questions",
      userPrompt,
      {
        systemPrompt,
        pdfBase64,
        mimeType: pdfBase64 ? "application/pdf" : undefined,
        maxTokens: 4096,
        jsonMode: true,
      },
    );

    const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return apiError("Réponse IA invalide", 502);

    let parsed: { questions?: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return apiError("JSON invalide dans la réponse IA", 502);
    }
    if (!Array.isArray(parsed.questions)) {
      return apiError("Format de questions inattendu", 502);
    }

    const validQuestions = parsed.questions
      .filter(
        (q): q is GeneratedQuestion =>
          q != null &&
          typeof q.question === "string" &&
          Array.isArray(q.options) &&
          q.options.every((o) => typeof o === "string") &&
          typeof q.answer_index === "number" &&
          q.answer_index >= 0 &&
          q.answer_index < q.options.length &&
          (q.type === "mcq" || q.type === "truefalse"),
      )
      .slice(0, count);

    if (validQuestions.length === 0) {
      return apiError("Aucune question valide générée", 502);
    }

    const { data: insertedRows, error: insertError } = await db
      .from("quiz_questions")
      .insert(
        validQuestions.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options,
          answer_index: q.answer_index,
          explanation: q.explanation ?? null,
          period: q.period ?? null,
          subject,
          difficulty: difficulty as 1 | 2 | 3,
          status: "approved" as const,
          is_ai_generated: true,
        })),
      )
      .select("id");

    if (insertError || !insertedRows) {
      return safeError(
        insertError,
        "generate-questions:insert",
        "Erreur d'insertion des questions",
      );
    }

    const persistedQuestions: PersistedQuestion[] = validQuestions.map(
      (q, i) => ({
        ...q,
        id: (insertedRows[i] as { id: string }).id,
      }),
    );

    await Promise.allSettled(
      persistedQuestions.map(async (q) => {
        const conceptIds = await inferConceptsFromQuestion(
          q.question,
          q.period ?? null,
          subject,
        );
        if (conceptIds.length > 0) {
          await tagQuestionWithConcepts(q.id, q.type, conceptIds);
        }
      }),
    );

    try {
      await db
        .from("generated_questions_cache")
        .insert({ cache_key: cacheKey, subject, questions: persistedQuestions });
    } catch {
      // best-effort cache insert
    }

    return apiOk({ questions: persistedQuestions });
  } catch (err) {
    if (err instanceof GracefulAIError) {
      return apiError("Service IA temporairement indisponible", 503);
    }
    return safeError(err, "generate-questions");
  }
}
