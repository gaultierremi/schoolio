import { NextRequest, NextResponse } from "next/server";
import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { routeAIRequest, GracefulAIError } from "@/lib/ai-router";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import type { SchoolLevel } from "@/lib/subjects";
import { logActivity } from "@/lib/activity/log";
import { getPdfPagesCount } from "@/lib/pdf/extract-pages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// LEGACY ANTHROPIC IMPLEMENTATION (kept for reference)
/*
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
const message = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 200,
  messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }, { type: "text", text: INFERENCE_PROMPT }] }],
});
*/

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const MAX_PDF_BYTES = 52428800;

const VALID_SUBJECTS = [
  "chimie",
  "physique",
  "biologie",
  "mathematiques",
  "histoire",
  "geographie",
  "francais",
  "anglais",
  "neerlandais",
  "autre",
] as const;

type CourseSubject = (typeof VALID_SUBJECTS)[number];

type CourseRow = {
  id: string;
  teacher_id: string;
  pdf_storage_path: string | null;
};

type GeminiInference = {
  subject?: unknown;
  level?: unknown;
  title?: unknown;
  confidence?: unknown;
};

type Inference = {
  subject: CourseSubject;
  level: SchoolLevel | null;
  title: string;
  confidence: number;
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

function getFilenameFromPath(path: string | null) {
  if (!path) return "Cours sans titre";
  const filename = path.split("/").pop()?.replace(/\.pdf$/i, "").trim();
  return filename || "Cours sans titre";
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

function parseGeminiJson(rawText: string, fallbackTitle: string): GeminiInference {
  try {
    return parseJsonObject<GeminiInference>(rawText);
  } catch {
    return {
      subject: "autre",
      level: null,
      title: fallbackTitle,
      confidence: 0,
    };
  }
}

function isCourseSubject(value: unknown): value is CourseSubject {
  return (
    typeof value === "string" &&
    (VALID_SUBJECTS as readonly string[]).includes(value)
  );
}

function normalizeLevel(value: unknown): SchoolLevel | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 6
    ? (value as SchoolLevel)
    : null;
}

function normalizeTitle(value: unknown) {
  if (typeof value !== "string") return "Cours sans titre";
  const title = value.trim();
  if (!title) return "Cours sans titre";
  return title.slice(0, 60);
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeInference(raw: GeminiInference): Inference {
  return {
    subject: isCourseSubject(raw.subject) ? raw.subject : "autre",
    level: normalizeLevel(raw.level),
    title: normalizeTitle(raw.title),
    confidence: normalizeConfidence(raw.confidence),
  };
}

const INFERENCE_PROMPT = `Tu es un assistant pédagogique spécialisé dans la classification de documents scolaires belges (système secondaire, niveaux 1 à 6).

Ta tâche : analyser le PDF fourni et identifier sa matière, son niveau scolaire et un titre court.

INDICATEURS PAR MATIÈRE :
- chimie : atomes, molécules, réactions, stœchiométrie, acides, bases, oxydation, équations chimiques, périodique
- physique : forces, mouvement, énergie, mécanique, optique, électricité, magnétisme, thermodynamique
- biologie : cellule, ADN, génétique, écosystème, anatomie, évolution, organismes, photosynthèse
- mathematiques : équations, fonctions, géométrie, algèbre, calcul, statistiques, probabilités, dérivées, intégrales
- histoire : époques, civilisations, guerres, dates, personnages historiques, événements, traités
- geographie : cartes, climats, populations, pays, continents, démographie, urbanisme, environnement
- francais : grammaire, conjugaison, orthographe, littérature, analyse de texte, dissertation
- anglais : English, vocabulary, grammar, tenses, reading comprehension
- neerlandais : Nederlands, woordenschat, grammatica, leesbegrip
- autre : UNIQUEMENT si le contenu est clairement hors des matières ci-dessus (philosophie, religion, art, sport, technologie, etc.)

INSTRUCTIONS CRITIQUES :
1. Examine le titre du document, le contenu textuel ET les images/schémas
2. Pour la matière : choisis "autre" UNIQUEMENT en dernier recours après avoir vraiment cherché. Le mot dans le titre du fichier (ex: "chimie") est un indice fort à privilégier.
3. Pour le niveau : déduis-le de la complexité du contenu et des programmes belges typiques. Si vraiment indéterminable, mets null.
4. Pour le titre : sois explicite et descriptif (max 60 caractères). Exemple : "Stœchiométrie et réactions - Chapitre 4" plutôt que "Cours".
5. Pour la confiance : 90-100 si certain, 70-90 si probable, 50-70 si hésitation, en dessous si vraiment dans le brouillard.

EXEMPLES DE CLASSIFICATION CORRECTE :
- PDF "Dossier de révision - 4e chimie.pdf" parlant d'atomes → subject: "chimie", level: 4, title: "Révision atomes - 4e chimie", confidence: 95
- PDF "peel_courshistoire3eannee.pdf" parlant de l'Antiquité → subject: "histoire", level: 3, title: "Antiquité : Moyen-Orient, Grèce, Rome", confidence: 90
- PDF "fiche_5_2.pdf" parlant de calorimétrie → subject: "physique", level: null, title: "Calorimétrie - Fiche 5.2", confidence: 75

FORMAT DE RÉPONSE (JSON STRICT, AUCUN TEXTE AUTOUR) :
{"subject": "chimie", "level": 4, "title": "Stœchiométrie et réactions - Chapitre 4", "confidence": 85}`;

const INFERENCE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    subject: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...VALID_SUBJECTS],
    },
    level: {
      type: SchemaType.INTEGER,
      nullable: true,
    },
    title: {
      type: SchemaType.STRING,
    },
    confidence: {
      type: SchemaType.INTEGER,
    },
  },
  required: ["subject", "level", "title", "confidence"],
};

async function generateInferenceJson(pdfBase64: string, prompt: string): Promise<string> {
  const response = await routeAIRequest("infer_metadata", prompt, {
    pdfBase64,
    requireVision: true,
    responseSchema: INFERENCE_SCHEMA,
    maxTokens: 256,
    cacheTtlMs: 0,
  });
  return response.text;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses/infer-metadata]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );

    if (teacherError) {
      console.error("[courses/infer-metadata]", teacherError);
      return NextResponse.json({ error: "Erreur de verification professeur" }, { status: 500 });
    }

    if (isTeacher !== true) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const body = (await request.json()) as { courseId?: unknown };
    const courseId = typeof body.courseId === "string" ? body.courseId : "";

    if (!UUID_REGEX.test(courseId)) {
      return NextResponse.json({ error: "courseId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, teacher_id, pdf_storage_path")
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
      console.error("[courses/infer-metadata]", downloadError);
      return NextResponse.json(
        { error: "Impossible de telecharger le PDF du cours" },
        { status: 500 }
      );
    }

    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBuffer = Buffer.from(pdfArrayBuffer);
    const pdfBase64 = pdfBuffer.toString("base64");
    if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF trop volumineux" }, { status: 400 });
    }

    const [pagesCount, rawText] = await Promise.all([
      getPdfPagesCount(pdfBuffer),
      generateInferenceJson(pdfBase64, INFERENCE_PROMPT),
    ]);
    const inference = normalizeInference(parseGeminiJson(rawText, getFilenameFromPath(typedCourse.pdf_storage_path)));

    const { error: updateError } = await admin
      .from("courses")
      .update({
        subject_enum: inference.subject,
        level: inference.level,
        title: inference.title,
        pages_count: pagesCount > 0 ? pagesCount : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId);

    if (updateError) throw updateError;

    await logActivity({
      event_type: "teacher_imported_pdf",
      actor_id: user.id,
      actor_type: "teacher",
      target_type: "course",
      target_id: courseId,
      teacher_id: user.id,
      context: { subject: inference.subject, title: inference.title },
    });
    // TODO: track system_cache_hit events when Gemini returns a cached response

    return NextResponse.json({
      success: true,
      inference,
    });
  } catch (error) {
    console.error("[courses/infer-metadata]", error);
    if (error instanceof GracefulAIError) {
      return NextResponse.json({ error: "Service temporairement saturé" }, { status: 503 });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
