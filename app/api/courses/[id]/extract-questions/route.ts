import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const MAX_PDF_BYTES = 52428800;
const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type CourseRow = {
  id: string;
  teacher_id: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
};

const EXTRACT_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, format: "enum", enum: ["mcq", "truefalse"] },
          question: { type: SchemaType.STRING },
          options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          answer_index: { type: SchemaType.INTEGER },
          explanation: { type: SchemaType.STRING },
        },
        required: ["type", "question", "options", "answer_index"],
      },
    },
  },
  required: ["questions"],
};

type ExtractedQ = {
  type: "mcq" | "truefalse";
  question: string;
  options: string[];
  answer_index: number;
  explanation?: string;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const courseId = params.id;
    if (!UUID_REGEX.test(courseId)) {
      return NextResponse.json({ error: "courseId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: course } = await admin
      .from("courses")
      .select("id, teacher_id, subject_enum, level, pdf_storage_path")
      .eq("id", courseId)
      .limit(1)
      .maybeSingle();

    if (!course) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    const typedCourse = course as CourseRow;
    if (typedCourse.teacher_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (!typedCourse.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF associé à ce cours" }, { status: 400 });
    }

    const { data: pdfBlob, error: downloadError } = await admin.storage
      .from("course-pdfs")
      .download(typedCourse.pdf_storage_path);

    if (downloadError || !pdfBlob) {
      return NextResponse.json({ error: "Impossible de télécharger le PDF" }, { status: 500 });
    }

    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
    if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF trop volumineux" }, { status: 400 });
    }

    const pdfBase64 = pdfBuffer.toString("base64");

    const model = gemini.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
        responseSchema: EXTRACT_SCHEMA,
      },
    });

    const prompt =
      "Tu es un assistant pédagogique. Trouve et extrait TOUTES les questions de quiz (QCM ou Vrai/Faux) qui sont DÉJÀ ÉCRITES dans ce document PDF. " +
      "Ne génère PAS de nouvelles questions. Extrais uniquement les questions présentes verbatim dans le document. " +
      "Pour chaque question, extrais : le texte exact de la question, les options de réponse, l'index de la bonne réponse (0-based), et si disponible une explication. " +
      "Si le document ne contient aucune question, retourne un tableau vide. " +
      "Réponds UNIQUEMENT avec le JSON demandé.";

    const result = await model.generateContent([
      { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
      { text: prompt },
    ]);

    const raw = result.response.text();
    let parsed: { questions: ExtractedQ[] };
    try {
      parsed = JSON.parse(raw) as { questions: ExtractedQ[] };
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return NextResponse.json({ error: "Réponse IA invalide" }, { status: 500 });
      parsed = JSON.parse(match[0]) as { questions: ExtractedQ[] };
    }

    const questions = (parsed.questions ?? []).filter(
      (q) => q.question && Array.isArray(q.options) && q.options.length >= 2
    );

    if (questions.length === 0) {
      return NextResponse.json({ extracted: 0, message: "Aucune question trouvée dans le PDF" });
    }

    const rows = questions.map((q) => ({
      teacher_id: user.id,
      course_id: courseId,
      subject: null,
      subject_enum: typedCourse.subject_enum ?? null,
      level: typedCourse.level ?? null,
      type: q.type === "truefalse" ? "truefalse" : "mcq",
      question: q.question,
      options: q.type === "truefalse" ? ["Vrai", "Faux"] : q.options.slice(0, 4),
      answer_index: Math.max(0, Math.min(q.answer_index, q.options.length - 1)),
      explanation: q.explanation || null,
      is_ai_generated: false,
      is_public: false,
      origin: "extracted_from_pdf",
    }));

    const { error: insertError } = await admin.from("teacher_questions").insert(rows);
    if (insertError) throw insertError;

    return NextResponse.json({ extracted: rows.length });
  } catch (err) {
    console.error("[courses/extract-questions]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
