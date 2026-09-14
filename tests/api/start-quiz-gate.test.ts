/**
 * Invariant 2 — Porte unique de diffusion : POST /api/student/assignments/[id]/start-quiz.
 *
 * Deux sites de filtre dans cette route (ids pré-échantillonnés / fallback par
 * cours). Les deux ne doivent regarder QUE is_active. Et l'upsert sur
 * assignment_completions (table never-DELETE, règle 23) ne doit jamais précéder
 * la preuve qu'il y a des questions à servir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, createFakeAuthClient } from "../helpers/supabase-mock";
import { datasetHandler, type Dataset } from "../helpers/rows";
import { makeRequest, readJson } from "../helpers/route";

const state = vi.hoisted(() => ({ auth: null as unknown, admin: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ createClient: () => state.auth }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.admin }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn(async () => undefined) }));

import { POST } from "@/app/api/student/assignments/[id]/start-quiz/route";

const A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = { id: "student-1", email: "eleve@example.test" };

// Quatre états possibles d'une question, nommés par ce qu'ils testent.
const Q = {
  activeSansValidation:  { id: "q-active-nv",   course_id: "course-1", is_active: true,  validated_at: null,  rejected_at: null,  question: "A", options: [], answer_index: 0, type: "mcq", created_at: "2026-01-01" },
  activeValidee:         { id: "q-active-val",  course_id: "course-1", is_active: true,  validated_at: "2026-01-01", rejected_at: null, question: "B", options: [], answer_index: 0, type: "mcq", created_at: "2026-01-02" },
  inactiveValidee:       { id: "q-inactive-val",course_id: "course-1", is_active: false, validated_at: "2026-01-01", rejected_at: null, question: "C", options: [], answer_index: 0, type: "mcq", created_at: "2026-01-03" },
  inactiveRejetee:       { id: "q-inactive-rej",course_id: "course-1", is_active: false, validated_at: null, rejected_at: "2026-01-01", question: "D", options: [], answer_index: 0, type: "mcq", created_at: "2026-01-04" },
};

function setup(opts: { sampled?: string[]; questions?: Array<Record<string, unknown>> } = {}) {
  state.auth = createFakeAuthClient({ user: STUDENT });
  const dataset: Dataset = {
    assignments: [{ id: A_ID, class_id: "class-1", resource_type: "quiz", resource_id: "course-1", archived_at: null }],
    class_memberships: [{ id: "m1", class_id: "class-1", student_user_id: STUDENT.id, status: "active" }],
    assignment_completions: [],
    assignment_questions: (opts.sampled ?? []).map((qid) => ({ assignment_id: A_ID, question_id: qid })),
    teacher_questions: opts.questions ?? Object.values(Q),
    classes: [{ id: "class-1", teacher_id: "teacher-1" }],
  };
  const db = createFakeSupabase(datasetHandler(dataset));
  state.admin = db.client;
  return db;
}

async function start() {
  const res = await POST(makeRequest("POST", `http://localhost/api/student/assignments/${A_ID}/start-quiz`), { params: { id: A_ID } });
  return { res, body: await readJson<{ questions?: Array<{ id: string }>; error?: string }>(res) };
}

const questionQueries = (db: ReturnType<typeof setup>) => db.on("teacher_questions");
const completionsWrites = (db: ReturnType<typeof setup>) =>
  db.on("assignment_completions").filter((c) => c.op !== "select");

beforeEach(() => { state.auth = null; state.admin = null; });

describe("start-quiz — site 1 : ids pré-échantillonnés", () => {
  it("une question is_active=true SANS validated_at est servie", async () => {
    setup({ sampled: [Q.activeSansValidation.id] });
    const { res, body } = await start();
    expect(res.status).toBe(200);
    expect(body.questions?.map((q) => q.id)).toEqual([Q.activeSansValidation.id]);
  });

  it("une question is_active=false est exclue MÊME avec validated_at posé", async () => {
    setup({ sampled: [Q.activeValidee.id, Q.inactiveValidee.id] });
    const { body } = await start();
    expect(body.questions?.map((q) => q.id)).toEqual([Q.activeValidee.id]);
  });

  it("le filtre porte sur is_active et sur rien d'autre (ni validated_at, ni rejected_at)", async () => {
    const db = setup({ sampled: [Q.activeValidee.id] });
    await start();
    const q = questionQueries(db)[0];
    expect(q.filters).toEqual([["in", "id", [Q.activeValidee.id]], ["eq", "is_active", true]]);
  });
});

describe("start-quiz — site 2 : fallback par cours", () => {
  it("sert exactement les questions actives du cours, validées ou non", async () => {
    setup(); // pas d'échantillon → fallback
    const { res, body } = await start();
    expect(res.status).toBe(200);
    expect(body.questions?.map((q) => q.id).sort()).toEqual(
      [Q.activeSansValidation.id, Q.activeValidee.id].sort(),
    );
  });

  it("le filtre porte sur course_id + is_active, et sur rien d'autre", async () => {
    const db = setup();
    await start();
    const q = questionQueries(db)[0];
    const cols = q.filters.filter((f) => f[0] !== "order").map((f) => [f[0], f[1], f[2]]);
    expect(cols).toEqual([["eq", "course_id", "course-1"], ["eq", "is_active", true]]);
    expect(q.filters.some((f) => f[1] === "validated_at" || f[1] === "rejected_at")).toBe(false);
  });
});

describe("start-quiz — règle 23 : aucune écriture sans question à servir", () => {
  it("toutes les questions inactives → 400, et AUCUN upsert sur assignment_completions", async () => {
    const db = setup({ questions: [Q.inactiveValidee, Q.inactiveRejetee] });
    const { res, body } = await start();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Aucune question/);
    expect(completionsWrites(db)).toHaveLength(0);
  });

  it("cas nominal → un seul upsert, et il vient APRÈS la lecture des questions", async () => {
    const db = setup();
    await start();
    const writes = completionsWrites(db);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("upsert");
    const idxQuestions = db.calls.findIndex((c) => c.table === "teacher_questions");
    const idxUpsert = db.calls.indexOf(writes[0]);
    expect(idxQuestions).toBeGreaterThan(-1);
    expect(idxUpsert).toBeGreaterThan(idxQuestions);
  });
});
