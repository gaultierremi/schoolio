import { NextRequest, NextResponse } from "next/server";
import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { createHash } from "crypto";
import { routeAIRequest, GracefulAIError } from "@/lib/ai-router";
import { createClient } from "@supabase/supabase-js";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";
import { requireUser } from "@/lib/api/auth";

export const maxDuration = 60;

// LEGACY ANTHROPIC IMPLEMENTATION (kept for reference)
/*
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
const message = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: buildSystemPrompt(subject, level),
  messages: [{
    role: "user",
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
      { type: "text", text: "Genere les questions de quiz basees sur ce document." },
    ],
  }],
});
*/

const MAX_PDF_BYTES = 52428800;

function getDb() {
  return createClient(
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
    ` {"page_count": 12, "questions": [{"type": "mcq", "question": "...", "options": ["A", "B", "C", "D"], "answer_index": 0, "explanation": "...", "period": "..."}]}.` +
    ` Genere entre 5 et 15 questions variees. Les questions doivent etre claires, pedagogiques et directement liees au contenu du document.` +
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

const QUESTIONS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    page_count: { type: SchemaType.INTEGER },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, format: "enum", enum: ["mcq", "truefalse"] },
          question: { type: SchemaType.STRING },
          options: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          answer_index: { type: SchemaType.INTEGER },
          explanation: { type: SchemaType.STRING },
          period: { type: SchemaType.STRING },
        },
        required: ["type", "question", "options", "answer_index", "explanation", "period"],
      },
    },
  },
  required: ["page_count", "questions"],
};

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

async function generateQuestionsWithFallback(pdfBase64: string, prompt: string): Promise<string> {
  const response = await routeAIRequest("extract_questions_from_pdf", `${prompt}\n\nGenere les questions de quiz basees sur ce document.`, {
    pdfBase64,
    requireVision: true,
    responseSchema: QUESTIONS_SCHEMA,
    maxTokens: 4096,
    cacheTtlMs: 0,
  });
  return response.text;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as {
      pdf?: string;
      subject?: unknown;
      level?: unknown;
    };

    const { pdf } = body;

    if (!pdf) {
      return NextResponse.json({ error: "Champ pdf manquant" }, { status: 400 });
    }

    if (Buffer.byteLength(pdf, "base64") > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF trop volumineux" }, { status: 400 });
    }

    const subject: SubjectId = isValidSubject(body.subject) ? body.subject : "histoire";
    const level: SchoolLevel | null = isValidLevel(body.level) ? body.level : null;

    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    const cacheKey = createHash("sha256")
      .update(`${pdfHash}:${subject}:${level ?? "any"}:gemini-2.5`)
      .digest("hex");

    const db = getDb();

    const { data: cached } = await db
      .from("generated_questions_cache")
      .select("result")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.result) {
      const result = cached.result as {
        questions: ExtractedQuestion[];
        page_count?: number;
      };
      return NextResponse.json({
        questions: result.questions,
        fromCache: true,
        pageCount: result.page_count ?? null,
      });
    }

    const rawText = await generateQuestionsWithFallback(pdf, buildSystemPrompt(subject, level));
    const parsed = parseJsonObject<{
      questions: ExtractedQuestion[];
      page_count?: number;
    }>(rawText);

    if (!Array.isArray(parsed.questions)) {
      return NextResponse.json({ error: "Format de reponse inattendu" }, { status: 500 });
    }

    const pageCount = typeof parsed.page_count === "number" ? parsed.page_count : null;

    try {
      await db.from("generated_questions_cache").insert({
        cache_key: cacheKey,
        result: { questions: parsed.questions, page_count: pageCount },
      });
    } catch {}

    return NextResponse.json({
      questions: parsed.questions,
      fromCache: false,
      pageCount,
    });
  } catch (err) {
    if (err instanceof GracefulAIError) {
      return NextResponse.json({ error: "Service temporairement sature" }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
