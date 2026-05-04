import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";

export const maxDuration = 60;

const client = new Anthropic();

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Themes per subject used for the "period" field in generated questions.
// Histoire keeps historical periods. Sciences get subject-specific themes.
// Other subjects: Claude infers themes from the document.
const THEME_INSTRUCTIONS: Partial<Record<SubjectId, string>> = {
  histoire:
    "Pour le champ period, utilise l'une de ces périodes : Préhistoire, Antiquité, Moyen Âge, Renaissance, XVIe siècle, XVIIe siècle, XVIIIe siècle, XIXe siècle, XXe siècle, XXIe siècle, Autre.",
  chimie:
    "Pour le champ period, utilise l'un de ces thèmes : Atomes et molécules, Réactions chimiques, Stœchiométrie, Acides et bases, Chimie organique, Liaisons chimiques, Tableau périodique, Autre.",
  physique:
    "Pour le champ period, utilise l'un de ces thèmes : Mécanique, Énergie, Électricité, Optique, Thermodynamique, Ondes, Autre.",
  biologie:
    "Pour le champ period, utilise l'un de ces thèmes : Cellule, Génétique, Évolution, Écosystèmes, Anatomie humaine, Physiologie, Autre.",
};

function getLevelInstruction(level: SchoolLevel | null): string {
  if (!level) return "";
  if (level <= 2)
    return "Cours de début de secondaire (élèves 12-14 ans). Vocabulaire et notions fondamentales, questions directes et concrètes.";
  if (level <= 4)
    return "Cours de milieu de secondaire (élèves 14-16 ans). Compréhension, applications de concepts, mises en contexte.";
  return "Cours de fin de secondaire (élèves 16-18 ans). Analyse, synthèse, raisonnement, questions à plusieurs étapes.";
}

function buildSystemPrompt(subject: SubjectId, level: SchoolLevel | null): string {
  const subjectLabel = SUBJECTS_BY_ID[subject].label;
  const levelInstruction = getLevelInstruction(level);
  const themeInstruction =
    THEME_INSTRUCTIONS[subject] ??
    "Pour le champ period, identifie le thème principal de chaque question dans le document.";

  const levelClause = levelInstruction ? ` ${levelInstruction}` : "";

  return (
    `Tu es un assistant pédagogique. Analyse ce document et génère des questions de quiz pertinentes pour un cours de ${subjectLabel}.${levelClause}` +
    ` Réponds UNIQUEMENT en JSON valide avec ce format exact :` +
    ` {"page_count": 12, "questions": [{"type": "mcq", "question": "...", "options": ["A", "B", "C", "D"], "answer_index": 0, "explanation": "...", "period": "..."},` +
    ` {"type": "truefalse", "question": "...", "options": ["Vrai", "Faux"], "answer_index": 0, "explanation": "...", "period": "..."}]}.` +
    ` Génère entre 5 et 15 questions variées (mix QCM et Vrai/Faux). Les questions doivent être claires, pédagogiques et directement liées au contenu du document.` +
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

// NOTE: Les colonnes subject_enum et level de teacher_questions seront alimentées
// dans une PR suivante lors du refactor de saveDrafts() côté frontend.

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pdf?: string;
      subject?: unknown;
      level?: unknown;
    };

    const { pdf } = body;

    if (!pdf) {
      return NextResponse.json({ error: "Champ pdf manquant" }, { status: 400 });
    }

    // Fallback to 'histoire' for backward compatibility with existing callers
    const subject: SubjectId = isValidSubject(body.subject) ? body.subject : "histoire";
    const level: SchoolLevel | null = isValidLevel(body.level) ? body.level : null;

    // Two-step hash: PDF hash first (expensive), then combine with subject+level
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    const cacheKey = createHash("sha256")
      .update(`${pdfHash}:${subject}:${level ?? "any"}`)
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

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: buildSystemPrompt(subject, level),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf,
              },
            },
            {
              type: "text",
              text: "Génère les questions de quiz basées sur ce document.",
            },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Réponse invalide du modèle" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      questions: ExtractedQuestion[];
      page_count?: number;
    };

    if (!Array.isArray(parsed.questions)) {
      return NextResponse.json(
        { error: "Format de réponse inattendu" },
        { status: 500 }
      );
    }

    const pageCount =
      typeof parsed.page_count === "number" ? parsed.page_count : null;

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
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
