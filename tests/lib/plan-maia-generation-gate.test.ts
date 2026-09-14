/**
 * Invariant 2 — Porte unique : lib/plan-maia-generation.ts (site 5).
 *
 * La sélection des questions candidates au plan du jour ne doit regarder QUE
 * is_active. Une question active jamais validée est candidate ; une question
 * inactive ne l'est pas, même validée.
 */
import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "../helpers/supabase-mock";
import { datasetHandler, type Dataset } from "../helpers/rows";
import { generatePlanForStudent } from "@/lib/plan-maia-generation";

const STUDENT = "student-1";
const COURSE = "course-1";

function setup(questions: Array<Record<string, unknown>>) {
  const dataset: Dataset = {
    plan_maia_daily: [],
    user_profiles: [{ id: STUDENT, school_id: "school-1", role: "student" }],
    class_memberships: [{
      class_id: "class-1", student_user_id: STUDENT, status: "active",
      classes: { id: "class-1", teacher_id: "teacher-1", archived_at: null },
    }],
    assignments: [{ class_id: "class-1", resource_id: COURSE, resource_type: "quiz", archived_at: null }],
    // La gate « a déjà répondu au moins une fois » doit passer.
    assignment_question_answers: [{ student_user_id: STUDENT, question_id: "q-any", is_correct: false, created_at: "2026-01-01T00:00:00Z" }],
    teacher_questions: questions,
  };
  const db = createFakeSupabase(datasetHandler(dataset));
  return db;
}

const Q = {
  activeSansValidation: { id: "q1", course_id: COURSE, school_id: "school-1", is_active: true,  validated_at: null,         rejected_at: null, concept_id: "c1", subject_enum: "bio", difficulty_stars: 2, type: "mcq" },
  inactiveValidee:      { id: "q2", course_id: COURSE, school_id: "school-1", is_active: false, validated_at: "2026-01-01", rejected_at: null, concept_id: "c1", subject_enum: "bio", difficulty_stars: 2, type: "mcq" },
};

describe("plan-maia-generation — sélection des candidates", () => {
  it("toutes les questions inactives (même validées) → skipped / no_candidates", async () => {
    const db = setup([Q.inactiveValidee]);
    const result = await generatePlanForStudent(db.client as never, STUDENT, "2026-09-13");
    expect(result).toEqual({ kind: "skipped", reason: "no_candidates" });
  });

  it("une question is_active=true SANS validated_at EST candidate (on dépasse l'étape no_candidates)", async () => {
    const db = setup([Q.activeSansValidation]);
    const result = await generatePlanForStudent(db.client as never, STUDENT, "2026-09-13");
    // Peu importe l'issue des étapes suivantes (cool-down, maîtrise, insertion) :
    // ce qui est verrouillé ici, c'est que la porte n'a pas exclu la candidate.
    expect(result.kind === "skipped" && result.reason === "no_candidates").toBe(false);
  });

  it("le filtre des candidates : course_id ∈ cours assignés, school_id, is_active — et rien d'autre", async () => {
    const db = setup([Q.activeSansValidation]);
    await generatePlanForStudent(db.client as never, STUDENT, "2026-09-13");
    const candidates = db.on("teacher_questions")[0];
    const meaningful = candidates.filters.filter((f) => f[0] !== "limit");
    expect(meaningful).toEqual([
      ["in", "course_id", [COURSE]],
      ["eq", "school_id", "school-1"],
      ["eq", "is_active", true],
    ]);
  });
});
