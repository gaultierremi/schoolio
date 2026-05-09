import type { SubjectId, SchoolLevel } from "@/lib/subjects";

export type TeacherQuestion = {
  id: string;
  teacher_id: string;
  type: "mcq" | "truefalse";
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
  difficulty_stars: 1 | 2 | 3 | null;
};

export type ValTab = "pending" | "validated" | "rejected";

export type PublicQuestion = {
  id: string;
  type: "mcq" | "truefalse";
  question: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
  period: string | null;
  difficulty: number | null;
};

export type DraftQuestion = {
  key: number;
  type: "mcq" | "truefalse";
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
  type: "mcq" as "mcq" | "truefalse",
  question: "",
  options: ["", "", "", ""],
  answer_index: 0,
  explanation: "",
  subjectId: "autre" as SubjectId,
  level: null as SchoolLevel | null,
  period: "",
};
