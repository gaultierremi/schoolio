import type { SubjectId, SchoolLevel } from "@/lib/subjects";

// Types acceptés en DB (cf. supabase/migrations/20260514230000_question_types_diversification.sql).
// truefalse + multi_step sont supportés pour la rétrocompatibilité avec d'éventuelles
// questions legacy ; le pipeline AI ne produit plus que mcq / numeric / short_text.
export type QuestionType =
  | "mcq"
  | "truefalse"
  | "numeric"
  | "short_text"
  | "multi_step";

export type TeacherQuestion = {
  id: string;
  teacher_id: string;
  type: QuestionType;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
  subject: string | null;
  subject_enum: SubjectId | null;
  level: number | null;
  period: string | null;
  is_public: boolean;
  is_ai_generated: boolean | null;
  course_id: string | null;
  created_at: string;
  use_count?: number;
  validated_at: string | null;
  rejected_at: string | null;
  /**
   * Sprint 2A — toggle on/off (slider) qui remplacera progressivement le
   * multi-état dérivé (validated_at / rejected_at). Migration backfillée :
   * is_active = TRUE pour les questions déjà validated_at NOT NULL.
   * Cf. mémoire `project_curation_concept_view`.
   */
  is_active: boolean;
  difficulty_stars: 1 | 2 | 3 | null;
  origin: "ai_generated" | "extracted_from_pdf" | null;
  // Champs spécifiques par type (NULL si non-applicable).
  expected_numeric_answer?: number | null;
  numeric_tolerance?: number | null;
  numeric_unit?: string | null;
  expected_text_answers?: string[] | null;
  // Pipeline B image fields (NULL si question texte uniquement).
  image_url?: string | null;
  image_description_md?: string | null;
  formula_mathml?: string | null;
  molecule_smiles?: string | null;
  geo_topojson_path?: string | null;
  needs_review?: boolean | null;
  vision_type?: string | null;
};

export type ValTab = "pending" | "validated" | "rejected";

export type PublicQuestion = {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
  period: string | null;
  difficulty: number | null;
};

export type DraftQuestion = {
  key: number;
  type: QuestionType;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
  period: string;
  kept: boolean;
};

export type ProposeState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "proposed" }
  | { kind: "duplicate"; similarText: string };

export type PdfStats = {
  pageCount: number | null;
  questionCount: number;
  fromCache: boolean;
};

export const PERIODS = [
  "Préhistoire",
  "Antiquité",
  "Moyen Âge",
  "Renaissance",
  "XVIe siècle",
  "XVIIe siècle",
  "XVIIIe siècle",
  "XIXe siècle",
  "XXe siècle",
  "XXIe siècle",
  "Autre",
] as const;

export const BLANK_FORM = {
  type: "mcq" as QuestionType,
  question: "",
  options: ["", "", "", ""],
  answer_index: 0,
  explanation: "",
  subjectId: "autre" as SubjectId,
  level: null as SchoolLevel | null,
  period: "",
  // Champs numeric (utilisés uniquement quand type='numeric').
  expected_numeric_answer: "" as string,
  numeric_tolerance: "" as string,
  numeric_unit: "" as string,
  // Champ short_text (1-5 réponses acceptables, utilisé quand type='short_text').
  expected_text_answers: ["", "", "", "", ""] as string[],
};
