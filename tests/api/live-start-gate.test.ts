/**
 * Invariant 2 — Porte unique : POST /api/live/start.
 *
 * Le live était le seul chemin par lequel une question jamais relue pouvait
 * atteindre un élève : ni le sélecteur client ni le serveur ne gataient. Le
 * contrôle serveur est la garantie ; il doit refuser en 400 et ne rien écrire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "../helpers/supabase-mock";
import { datasetHandler, type Dataset } from "../helpers/rows";
import { makeRequest, readJson } from "../helpers/route";

const state = vi.hoisted(() => ({ admin: null as unknown }));
const TEACHER = { id: "teacher-1", email: "prof@example.test" };

vi.mock("@/lib/api/auth", () => ({
  requireTeacher: vi.fn(async () => ({ ok: true, user: TEACHER, email: TEACHER.email })),
}));
vi.mock("@/lib/supabase-server", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/tenant", () => ({ requireSchoolMembership: vi.fn(async () => "school-1") }));
vi.mock("@/lib/live/codes", () => ({ generateLiveSessionCode: () => "ABC123" }));
vi.mock("@/lib/observability/log-error", () => ({ logError: vi.fn(async () => undefined) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.admin }));

import { POST } from "@/app/api/live/start/route";

const U = (n: number) => `${n}0000000-0000-4000-8000-000000000000`.slice(0, 36);
const ACTIVE   = { id: U(1), school_id: "school-1", is_active: true };
const INACTIVE = { id: U(2), school_id: "school-1", is_active: false };
const FOREIGN  = { id: U(3), school_id: "school-other", is_active: true };

function setup(questions: Array<Record<string, unknown>>) {
  const dataset: Dataset = { teacher_questions: questions, live_sessions: [] };
  const db = createFakeSupabase(datasetHandler(dataset));
  state.admin = db.client;
  return db;
}

async function start(ids: string[]) {
  const res = await POST(makeRequest("POST", "http://localhost/api/live/start", { title: "Test", question_ids: ids }));
  return { res, body: await readJson<{ error?: string; session?: unknown }>(res) };
}

beforeEach(() => { state.admin = null; });

describe("live/start — contrôle is_active côté serveur", () => {
  it("une question sélectionnée inactive → 400, message actionnable, AUCUNE session créée", async () => {
    const db = setup([ACTIVE, INACTIVE]);
    const { res, body } = await start([ACTIVE.id, INACTIVE.id]);
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/inactive/i);
    expect(db.on("live_sessions")).toHaveLength(0);
    expect(db.writes()).toHaveLength(0);
  });

  it("le contrôle précède toute écriture : la seule requête émise est la lecture des questions", async () => {
    const db = setup([INACTIVE]);
    await start([INACTIVE.id]);
    expect(db.calls.map((c) => `${c.table}:${c.op}`)).toEqual(["teacher_questions:select"]);
  });

  it("la lecture des questions demande explicitement is_active", async () => {
    const db = setup([ACTIVE]);
    await start([ACTIVE.id]);
    const q = db.on("teacher_questions")[0];
    expect(String(q.args[0])).toMatch(/is_active/);
  });

  it("une question d'une autre école → 403 (garde tenant préservée), aucune écriture", async () => {
    const db = setup([FOREIGN]);
    const { res } = await start([FOREIGN.id]);
    expect(res.status).toBe(403);
    expect(db.writes()).toHaveLength(0);
  });

  it("toutes les questions actives et de l'école → 201, une seule insertion live_sessions", async () => {
    const db = setup([ACTIVE]);
    const { res } = await start([ACTIVE.id]);
    expect(res.status).toBe(201);
    const inserts = db.on("live_sessions").filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(1);
  });
});
