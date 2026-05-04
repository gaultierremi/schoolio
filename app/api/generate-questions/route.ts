import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { SUBJECTS } from "@/lib/subjects";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type GeneratedQuestion = {
  type: "mcq" | "truefalse";
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
  period: string;
};

const SUBJECT_INSTRUCTIONS: Record<string, string> = {
  histoire:
    "Génère des questions sur des événements historiques, des personnages et des contextes géopolitiques. Inclus dates clés et conséquences.",
  sciences:
    "Génère des questions sur des phénomènes scientifiques, expériences marquantes et découvertes. Couvre physique, chimie, biologie et sciences naturelles.",
  mathematiques:
    "Génère des problèmes mathématiques avec des énoncés précis et des résultats exacts. Couvre algèbre, géométrie, probabilités et analyse.",
  geographie:
    "Génère des questions sur des pays, capitales, reliefs, fleuves, densités et géographie humaine et physique.",
  litterature:
    "Génère des questions sur des œuvres majeures, leurs auteurs, les mouvements littéraires et les genres. Couvre différentes époques et nationalités.",
  droit:
    "Génère des cas pratiques et questions sur le droit positif français et européen. Couvre droit civil, pénal, constitutionnel et du travail.",
  medecine:
    "Génère des questions cliniques et anatomiques rigoureuses. Couvre anatomie, physiologie, sémiologie, pathologies courantes et traitements de référence.",
  permis:
    "Génère des questions de code de la route avec des situations de conduite réalistes. Inclus signalisation, priorités, distances de freinage et sécurité routière.",
  langues:
    "Génère des questions de vocabulaire, grammaire, conjugaison et expressions idiomatiques. Adapte la langue en fonction du sujet fourni.",
  autre:
    "Génère des questions pédagogiques variées, claires et pertinentes par rapport au sujet fourni.",
};

function buildSystemPrompt(
  subjectId: string,
  count: number,
  difficulty: number
): string {
  const subjectLabel =
    SUBJECTS.find((s) => s.id === subjectId)?.label ?? subjectId;
  const instruction =
    SUBJECT_INSTRUCTIONS[subjectId] ?? SUBJECT_INSTRUCTIONS.autre;
  const difficultyLabel =
    difficulty === 1 ? "débutant" : difficulty === 2 ? "intermédiaire" : "expert";

  return `Tu es un assistant pédagogique expert en ${subjectLabel}. ${instruction}
Génère exactement ${count} questions de niveau ${difficultyLabel} (mix QCM et Vrai/Faux). Réponds UNIQUEMENT en JSON valide :
{"questions":[{"type":"mcq","question":"...","options":["A","B","C","D"],"answer_index":0,"explanation":"...","period":"..."},{"type":"truefalse","question":"...","options":["Vrai","Faux"],"answer_index":0,"explanation":"...","period":"..."}]}
Règles : options correctement ordonnées, answer_index correspond à la bonne réponse, explication courte et pédagogique, period = période/domaine pertinent ou "Général".`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pdfBase64?: string;
      topic?: string;
      subject: string;
      count?: number;
      difficulty?: number;
    };

    const { pdfBase64, topic, subject } = body;
    const count = Math.min(Math.max(body.count ?? 10, 1), 25);
    const difficulty = Math.min(Math.max(body.difficulty ?? 1, 1), 3);

    if (!pdfBase64 && !topic) {
      return NextResponse.json(
        { error: "PDF ou sujet (topic) requis" },
        { status: 400 }
      );
    }
    if (!subject) {
      return NextResponse.json({ error: "Matière requise" }, { status: 400 });
    }

    // Cache key: hash of first 2000 chars of PDF, or full topic+params string
    const cacheInput = pdfBase64
      ? pdfBase64.slice(0, 2000)
      : `${subject}:${topic}:${count}:${difficulty}`;
    const cacheKey = createHash("sha256").update(cacheInput).digest("hex");

    const db = getDb();

    const { data: cached } = await db
      .from("generated_questions_cache")
      .select("questions")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.questions) {
      const questions = (cached.questions as GeneratedQuestion[]).slice(0, count);
      return NextResponse.json({ questions, cached: true });
    }

    const systemPrompt = buildSystemPrompt(subject, count, difficulty);
    const client = new Anthropic();
    let rawText: string;

    if (pdfBase64) {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
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
                text: `Génère ${count} questions de niveau ${difficulty === 1 ? "débutant" : difficulty === 2 ? "intermédiaire" : "expert"} à partir de ce document.`,
              },
            ],
          },
        ],
      });
      rawText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Sujet : "${topic}"\nGénère ${count} questions sur ce sujet.`,
          },
        ],
      });
      rawText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    }

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Réponse invalide du modèle" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      questions?: GeneratedQuestion[];
    };

    if (!Array.isArray(parsed.questions)) {
      return NextResponse.json({ error: "Format inattendu" }, { status: 500 });
    }

    // Persist to cache (best-effort)
    try {
      await db
        .from("generated_questions_cache")
        .insert({ cache_key: cacheKey, subject, questions: parsed.questions });
    } catch {}

    return NextResponse.json({ questions: parsed.questions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
