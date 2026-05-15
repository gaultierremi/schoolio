import type { PostgrestError } from "@supabase/supabase-js";
import { withAdminClient } from "@/lib/db/admin-client";
import type { ImageType } from "@/lib/pdf/image-types";

// Type centralise pour les inserts teacher_questions. Inclut les nouveaux
// champs pipeline B nullable. Code pipeline A et B utilisent ce meme type.

export type TeacherQuestionInsertRow = {
  teacher_id: string;
  school_id: string;
  course_id: string;
  subject: string | null;
  subject_enum: string | null;
  level: number | null;
  type: "mcq" | "numeric" | "short_text";
  question: string;
  options: string[];                       // empty array for non-mcq
  answer_index: number;                    // 0 for non-mcq
  expected_numeric_answer: number | null;
  numeric_tolerance: number | null;
  numeric_unit: string | null;
  expected_text_answers: string[] | null;
  explanation: string | null;
  period: string;                          // chapter title
  difficulty_stars: number | null;
  organization_tags: string[];
  is_ai_generated: boolean;
  is_public: boolean;
  page_range_start: number | null;
  page_range_end: number | null;
  concept_page_hint: number | null;
  // === Pipeline B fields (all nullable) ===
  image_url?: string | null;
  image_hash?: string | null;
  image_page_number?: number | null;
  image_description_md?: string | null;
  image_confidence?: number | null;
  vision_type?: ImageType | null;
  formula_latex?: string | null;
  formula_mathml?: string | null;
  molecule_smiles?: string | null;
  geo_topojson_path?: string | null;
  needs_review?: boolean;
};

export async function insertTeacherQuestions(
  rows: TeacherQuestionInsertRow[],
): Promise<{ count: number; error: PostgrestError | null }> {
  if (rows.length === 0) return { count: 0, error: null };
  return withAdminClient(async (admin) => {
    const { error, count } = await admin
      .from("teacher_questions")
      .insert(rows, { count: "exact" });
    return { count: count ?? 0, error };
  });
}
