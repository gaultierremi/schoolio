import type { SectionKind } from "@/lib/curation/validation";

/**
 * Types partagés entre server fetcher et client `ConceptEditor` (Sprint 2B PR B).
 */

export type ConceptRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  source_quote: string | null;
  source_concept_path: string | null;
  program_id: string;
  uaa_id: string | null;
  school_id: string;
};

export type TheoryBlockRow = {
  id: string;
  paragraph_ordinal: number;
  /** Sprint 2B : NULL si row legacy (à classer manuellement par le prof). */
  section_kind: SectionKind | null;
  content: string;
  updated_at: string;
  approved_at: string | null;
};

export type QuestionRow = {
  id: string;
  type: string;
  question: string;
  is_active: boolean;
  validated_at: string | null;
  rejected_at: string | null;
  difficulty_stars: 1 | 2 | 3 | null;
  created_at: string;
};

export type MisconceptionRow = {
  id: string;
  label: string;
  ordinal: number;
  created_at: string;
  updated_at: string;
};

export type ConceptEditorData = {
  concept: ConceptRow;
  theoryBlocks: TheoryBlockRow[];
  questions: QuestionRow[];
  misconceptions: MisconceptionRow[];
};
