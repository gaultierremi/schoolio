// ── Contrat partagé Claudy ↔ Coco — POC Cockpit v0.1 ─────────────────────────
// Ce fichier est la source de vérité pour tous les types du cockpit prof.
// Ne pas modifier sans accord des deux agents.

// ── Session ───────────────────────────────────────────────────────────────────

export type DemoPdfKey = "demo-1" | "demo-2" | "demo-3";

export type CockpitSession = {
  id: string;
  code: string;
  pdf_key: DemoPdfKey;
  current_page: number;
  total_pages: number;
  is_active: boolean;
  transcript: string;
  created_at: string; // ISO 8601
  ended_at: string | null;
};

// ── Post-cours : livrables IA ─────────────────────────────────────────────────

export type PostCourseDocType = "summary" | "quiz" | "flashcards" | "homework";

export type PostCourseDoc = {
  type: PostCourseDocType;
  content: string;       // markdown généré par l'IA
  generated_at: string;  // ISO 8601
};

// ── Devoirs personnalisés ─────────────────────────────────────────────────────

export type StudentLevel = "avancé" | "standard" | "basique";

export type MockStudent = {
  id: string;
  name: string;
  level: StudentLevel;
  avatar: string; // emoji
};

// 4 élèves mockés hardcodés — pas de migration
export const MOCK_STUDENTS: MockStudent[] = [
  { id: "s1", name: "Lucas D.",  level: "avancé",   avatar: "🧑‍💻" },
  { id: "s2", name: "Emma R.",   level: "standard",  avatar: "👩‍🔬" },
  { id: "s3", name: "Maxime L.", level: "standard",  avatar: "👨‍🎓" },
  { id: "s4", name: "Sofia K.",  level: "basique",   avatar: "👩‍🎨" },
];

export type PersonalizedAssignment = {
  student: MockStudent;
  assignment: string; // markdown généré par l'IA
  generated_at: string;
};

// ── Whispers ──────────────────────────────────────────────────────────────────

export type WhisperSource = "ai" | "mock";

export type WhisperMessage = {
  id: string;
  student: string;
  avatar: string;
  text: string;
  page: number;        // page du cours qui a déclenché le whisper
  source: WhisperSource;
  received_at: string; // ISO 8601
};

// ── Questions IA ──────────────────────────────────────────────────────────────

export type CockpitQuestion = {
  text: string;
  page: number;
  generated_at: string; // ISO 8601
};

// ── API contracts ─────────────────────────────────────────────────────────────

// POST /api/feat/cockpit/sessions
export type CreateSessionRequest = {
  pdf_key: DemoPdfKey;
};
export type CreateSessionResponse = {
  code: string;
  id: string;
};

// PATCH /api/feat/cockpit/sessions/[code]
export type UpdateSessionRequest = {
  current_page?: number;
  total_pages?: number;
  transcript?: string;
  is_active?: boolean;
};

// POST /api/feat/cockpit/sessions/[code]/generate
export type GenerateQuestionRequest = Record<string, never>; // body vide, tout vient de la session
export type GenerateQuestionResponse = {
  question: CockpitQuestion;
};

// POST /api/feat/cockpit/sessions/[code]/whisper
export type GenerateWhisperRequest = {
  page: number;
};
export type GenerateWhisperResponse = {
  whisper: WhisperMessage;
};

// POST /api/feat/cockpit/sessions/[code]/end
export type GeneratePostCourseRequest = {
  type: PostCourseDocType;
  // Pour "homework" : génère 4 assignments (un par MOCK_STUDENTS)
};
export type GeneratePostCourseResponse =
  | { type: Exclude<PostCourseDocType, "homework">; doc: PostCourseDoc }
  | { type: "homework"; assignments: PersonalizedAssignment[] };
