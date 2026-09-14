/**
 * Invariant 2 — Porte unique : POST /api/classes/[id]/assignments (création de quiz).
 *
 * Deux sites de filtre : le comptage qui décide si le quiz peut être créé, et
 * l'échantillonnage des questions. C'est ICI que le prof beta se faisait refuser
 * « ce cours n'a aucune question validée » après avoir validé dans l'onglet
 * par défaut. Les deux sites ne doivent regarder QUE is_active.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, createFakeAuthClient } from "../helpers/supabase-mock";
import { datasetHandler, type Dataset } from "../helpers/rows";
import { makeRequest, readJson } from "../helpers/route";

const state = vi.hoisted(() => ({ auth: null as unknown, admin: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ createClient: () => state.auth }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.admin }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn(async () => undefined) }));

import { POST } from "@/app/api/classes/[id]/assignments/route";

const CLASS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEACHER = { id: "teacher-1", email: "prof@example.test" };
const COURSE = "course-1";

const Q = {
  activeSansValidation: { id: "q-active-nv",    course_id: COURSE, is_active: true,  validated_at: null,         rejected_at: null,         page_range_start: 1 },
  activeValidee:        { id: "q-active-val",   course_id: COURSE, is_active: true,  validated_at: "2026-01-01", rejected_at: null,         page_range_start: 2 },
  inactiveValidee:      { id: "q-inactive-val", course_id: COURSE, is_active: false, validated_at: "2026-01-01", rejected_at: null,         page_range_start: 3 },
  inactiveRejetee:      { id: "q-inactive-rej", course_id: COURSE, is_active: false, validated_at: null,         rejected_at: "2026-01-01", page_range_start: 4 },
};

function setup(questions: Array<Record<string, unknown>>) {
  state.auth = createFakeAuthClient({ user: TEACHER, rpc: { is_current_user_school_teacher: true } });
  const dataset: Dataset = {
    classes: [{ id: CLASS_ID, teacher_id: TEACHER.id, school_id: "school-1" }],
    courses: [{ id: COURSE, teacher_id: TEACHER.id, pdf_storage_path: null }],
    teacher_questions: questions,
    assignments: [],
    assignment_questions: [],
  };
  const db = createFakeSupabase(datasetHandler(dataset));
  state.admin = db.client;
  return db;
}

async function createQuiz(questions_count = 5) {
  const res = await POST(
    makeRequest("POST", `http://localhost/api/classes/${CLASS_ID}/assignments`, {
      title: "Quiz test", resource_type: "quiz", resource_id: COURSE, questions_count,
    }),
    { params: { id: CLASS_ID } },
  );
  return { res, body: await readJson<{ error?: string }>(res) };
}

const questionQueries = (db: ReturnType<typeof setup>) => db.on("teacher_questions");
const sampledIds = (db: ReturnType<typeof setup>) => {
  const ins = db.on("assignment_questions").find((c) => c.op === "insert");
  return ((ins?.args[0] as Array<{ question_id: string }>) ?? []).map((r) => r.question_id).sort();
};

beforeEach(() => { state.auth = null; state.admin = null; });

describe("assignments POST — site 1 : le comptage qui autorise la création", () => {
  it("un cours dont l'unique question est is_active=true SANS validated_at → le quiz est créé", async () => {
    const db = setup([Q.activeSansValidation]);
    const { res, body } = await createQuiz();
    expect(res.status).toBeLessThan(400);
    expect(body.error).toBeUndefined();
    expect(db.on("assignments").filter((c) => c.op === "insert")).toHaveLength(1);
  });

  it("un cours dont toutes les questions sont inactives (même validées) → 400, aucun devoir créé", async () => {
    const db = setup([Q.inactiveValidee, Q.inactiveRejetee]);
    const { res, body } = await createQuiz();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/aucune question/i);
    expect(db.on("assignments").filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("le comptage filtre sur course_id + is_active, et sur rien d'autre", async () => {
    const db = setup([Q.activeValidee]);
    await createQuiz();
    const count = questionQueries(db).find((c) => c.isCount)!;
    expect(count.filters).toEqual([["eq", "course_id", COURSE], ["eq", "is_active", true]]);
  });
});

describe("assignments POST — site 2 : l'échantillonnage", () => {
  it("échantillonne les actives validées ou non, jamais les inactives même validées", async () => {
    const db = setup(Object.values(Q));
    await createQuiz(10);
    expect(sampledIds(db)).toEqual([Q.activeSansValidation.id, Q.activeValidee.id].sort());
  });

  it("l'échantillonnage filtre sur course_id + is_active, et sur rien d'autre", async () => {
    const db = setup(Object.values(Q));
    await createQuiz();
    const sampling = questionQueries(db).find((c) => !c.isCount)!;
    expect(sampling.filters).toEqual([["eq", "course_id", COURSE], ["eq", "is_active", true]]);
    expect(sampling.filters.some((f) => f[1] === "validated_at" || f[1] === "rejected_at")).toBe(false);
  });
});
