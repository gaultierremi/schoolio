import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import type { SchoolLevel } from "@/lib/subjects";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const client = new Anthropic();
const UUID_REGEX = /^[0-9a-f-]{36}$/i;

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

type ClaudeInference = {
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

function stripMarkdownFences(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseClaudeJson(rawText: string, fallbackTitle: string): ClaudeInference {
  try {
    const cleaned = stripMarkdownFences(rawText);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] ?? cleaned) as ClaudeInference;
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

function normalizeInference(raw: ClaudeInference): Inference {
  return {
    subject: isCourseSubject(raw.subject) ? raw.subject : "autre",
    level: normalizeLevel(raw.level),
    title: normalizeTitle(raw.title),
    confidence: normalizeConfidence(raw.confidence),
  };
}

const INFERENCE_PROMPT = `Tu analyses un PDF de cours scolaire (systeme belge secondaire, niveaux 1-6). Identifie:

1. La matiere parmi cette liste exacte: chimie, physique, biologie, mathematiques, histoire, geographie, francais, anglais, neerlandais, autre
2. Le niveau scolaire (1, 2, 3, 4, 5, ou 6) ou null si pas detectable
3. Un titre court et explicite (max 60 caracteres) qui resume le contenu, par exemple 'Les acides et les bases - chap 4'
4. Un score de confiance global de 0 a 100 (ta confiance dans la matiere+niveau combines)

Reponds UNIQUEMENT avec un JSON valide au format suivant, sans markdown, sans texte autour:
{"subject": "chimie", "level": 4, "title": "Stoechiometrie et reactions", "confidence": 85}

Si tu ne peux pas determiner la matiere, mets 'autre'. Si tu ne peux pas determiner le niveau, mets null.`;

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

    const pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString("base64");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: INFERENCE_PROMPT,
            },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const fallbackTitle = getFilenameFromPath(typedCourse.pdf_storage_path);
    const inference = normalizeInference(parseClaudeJson(rawText, fallbackTitle));

    const { error: updateError } = await admin
      .from("courses")
      .update({
        subject_enum: inference.subject,
        level: inference.level,
        title: inference.title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      inference,
    });
  } catch (error) {
    console.error("[courses/infer-metadata]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
