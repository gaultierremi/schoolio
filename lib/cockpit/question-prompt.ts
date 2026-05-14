import { routeAIRequest } from "@/lib/ai-router";
import type {
  DemoPdfKey,
  PostCourseDocType,
  CockpitQuestion,
  WhisperMessage,
  PersonalizedAssignment,
  MockStudent,
} from "@/types/post-course";
import { DEMO_PDFS, WHISPER_FALLBACKS } from "@/lib/cockpit/session";
import { randomBytes } from "crypto";

const AI_TIMEOUT_LIVE_MS = 14_000;  // questions & whispers
const AI_TIMEOUT_POST_MS = 60_000;  // livrables post-cours

function pdfMeta(pdfKey: DemoPdfKey) {
  return DEMO_PDFS.find((p) => p.key === pdfKey)!;
}

// ── Question Socratique pour la page courante ─────────────────────────────────

export async function generateCockpitQuestion(opts: {
  pdfKey: DemoPdfKey;
  currentPage: number;
  totalPages: number;
  transcript: string;
}): Promise<CockpitQuestion> {
  const meta = pdfMeta(opts.pdfKey);
  const progress = `page ${opts.currentPage}/${opts.totalPages}`;
  const context =
    opts.transcript.length > 20
      ? `Extrait du cours : «${opts.transcript.slice(-500)}»`
      : `(début du cours, pas encore de transcript)`;

  const prompt = `Tu es un assistant pédagogique Socratique.
Matière : ${meta.title} — ${meta.subject}
Position dans le cours : ${progress}
${context}

Génère UNE question ouverte, concise (max 25 mots), qui pousse les étudiants à réfléchir sur le concept clé de cette page. Pas de réponse, juste la question.`;

  const res = await routeAIRequest("cockpit_question", prompt, {
    maxTokens: 80,
    temperature: 0.7,
    cacheTtlMs: 0,
    // Timeout géré par l'appelant (AbortSignal, voir API route)
  });

  return {
    text: res.text.trim(),
    page: opts.currentPage,
    generated_at: new Date().toISOString(),
  };
}

// ── Whisper IA — déclenché au changement de page ──────────────────────────────

export async function generateWhisper(opts: {
  pdfKey: DemoPdfKey;
  page: number;
  transcript: string;
  studentName: string;
  studentAvatar: string;
}): Promise<WhisperMessage> {
  const meta = pdfMeta(opts.pdfKey);
  const hasContext = opts.transcript.trim().length >= 50;

  const id = randomBytes(4).toString("hex");
  const now = new Date().toISOString();

  if (!hasContext) {
    const fallbacks = WHISPER_FALLBACKS[opts.pdfKey];
    const text = fallbacks[opts.page % fallbacks.length];
    return {
      id,
      student: opts.studentName,
      avatar: opts.studentAvatar,
      text,
      page: opts.page,
      source: "mock",
      received_at: now,
    };
  }

  const prompt = `Tu es un étudiant curieux en ${meta.title}.
Extrait du cours : «${opts.transcript.slice(-400)}»
Page courante : ${opts.page}

Génère UNE question courte (max 20 mots) qu'un étudiant poserait en privé au prof sur ce passage — ton naturel, légèrement hésitant. Juste la question.`;

  const res = await routeAIRequest("cockpit_whisper", prompt, {
    maxTokens: 60,
    temperature: 0.85,
    cacheTtlMs: 0,
  });

  return {
    id,
    student: opts.studentName,
    avatar: opts.studentAvatar,
    text: res.text.trim(),
    page: opts.page,
    source: "ai",
    received_at: now,
  };
}

// ── Post-cours : résumé, quiz, flashcards ────────────────────────────────────

const POST_COURSE_PROMPTS: Record<Exclude<PostCourseDocType, "homework">, string> = {
  summary: `Génère un résumé structuré du cours en markdown (titres ##, listes).
Max 400 mots. Focus sur les concepts clés et les formules importantes.`,

  quiz: `Génère 5 questions QCM en markdown sur le cours.
Format : **Question** puis a) b) c) d) puis *Réponse : X)*
Difficulté progressive. Basé sur le transcript.`,

  flashcards: `Génère 8 flashcards en markdown.
Format : **Recto** : [terme/concept]\n**Verso** : [définition/formule courte]
Séparées par ---`,
};

export async function generatePostCourseDoc(opts: {
  pdfKey: DemoPdfKey;
  transcript: string;
  type: Exclude<PostCourseDocType, "homework">;
}): Promise<string> {
  const meta = pdfMeta(opts.pdfKey);
  const context =
    opts.transcript.length > 50
      ? `Transcript du cours : «${opts.transcript.slice(-2000)}»`
      : `(pas de transcript — génère un contenu générique sur ${meta.title})`;

  const prompt = `Matière : ${meta.title} — ${meta.subject}
${context}

${POST_COURSE_PROMPTS[opts.type]}`;

  const res = await routeAIRequest(`cockpit_postcourse_${opts.type}`, prompt, {
    maxTokens: 800,
    temperature: 0.4,
    cacheTtlMs: AI_TIMEOUT_POST_MS,
  });

  return res.text.trim();
}

// ── Post-cours : devoirs personnalisés par élève ──────────────────────────────

export async function generatePersonalizedAssignment(opts: {
  pdfKey: DemoPdfKey;
  transcript: string;
  student: MockStudent;
}): Promise<string> {
  const meta = pdfMeta(opts.pdfKey);
  const levelMap = {
    avancé: "niveau avancé — exercices complexes, démonstrations, cas limites",
    standard: "niveau standard — applications directes du cours",
    basique: "niveau basique — exercices guidés, rappels de définitions",
  };

  const context =
    opts.transcript.length > 50
      ? `Transcript : «${opts.transcript.slice(-1500)}»`
      : `(génère sur ${meta.title} — ${meta.subject})`;

  const prompt = `Matière : ${meta.title}
Élève : ${opts.student.name} (${levelMap[opts.student.level]})
${context}

Génère un devoir personnalisé en markdown adapté à cet élève.
2-3 exercices max, avec consignes claires. Max 250 mots.`;

  const res = await routeAIRequest(
    `cockpit_homework_${opts.student.level}`,
    prompt,
    {
      maxTokens: 400,
      temperature: 0.5,
      cacheTtlMs: AI_TIMEOUT_POST_MS,
    },
  );

  return res.text.trim();
}

export { AI_TIMEOUT_LIVE_MS, AI_TIMEOUT_POST_MS };
