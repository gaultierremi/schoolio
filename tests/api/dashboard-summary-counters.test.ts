/**
 * Invariant 2 — Porte unique : les deux compteurs de GET /api/school/dashboard-summary.
 *
 * UN SEUL compteur suit la porte : « validées » = stock assignable = is_active.
 * Le compteur « à relire » reste sur le journal de revue (validated_at et
 * rejected_at à NULL). L'aligner sur is_active=false agrégerait les rejetées et
 * les désactivées volontaires : la file de revue deviendrait inexploitable au
 * moment où elle devient le dernier rempart avant diffusion. Le jeu de données
 * est construit pour que cette régression change le nombre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, createFakeAuthClient } from "../helpers/supabase-mock";
import { datasetHandler, type Dataset } from "../helpers/rows";
import { readJson } from "../helpers/route";

const state = vi.hoisted(() => ({ auth: null as unknown, admin: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ createClient: () => state.auth }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.admin }));

import { GET } from "@/app/api/school/dashboard-summary/route";

const T = "teacher-1";
// Cinq états, choisis pour que « journal » et « is_active=false » donnent des
// nombres DIFFÉRENTS : à relire (journal) = {B, C} = 2 ; inactives = {C, D, E} = 3.
const QUESTIONS = [
  { id: "A", teacher_id: T, is_active: true,  validated_at: "2026-01-01", rejected_at: null },         // validée, active
  { id: "B", teacher_id: T, is_active: true,  validated_at: null,         rejected_at: null },         // active, jamais relue
  { id: "C", teacher_id: T, is_active: false, validated_at: null,         rejected_at: null },         // inactive, jamais relue
  { id: "D", teacher_id: T, is_active: false, validated_at: null,         rejected_at: "2026-01-01" }, // rejetée
  { id: "E", teacher_id: T, is_active: false, validated_at: "2026-01-01", rejected_at: null },         // validée, éteinte volontairement
];

function setup() {
  state.auth = createFakeAuthClient({ user: { id: T }, rpc: { is_current_user_school_teacher: true } });
  const dataset: Dataset = { teacher_questions: QUESTIONS, classes: [], courses: [], exercises: [] };
  const db = createFakeSupabase(datasetHandler(dataset));
  state.admin = db.client;
  return db;
}

type Summary = { to_handle?: Record<string, number>; kpis?: Record<string, number> } & Record<string, unknown>;

function dig(body: Summary, key: string): number | undefined {
  for (const v of Object.values(body)) {
    if (v && typeof v === "object" && key in (v as Record<string, unknown>)) {
      return (v as Record<string, number>)[key];
    }
  }
  return undefined;
}

beforeEach(() => { state.auth = null; state.admin = null; });

describe("dashboard-summary — les deux compteurs de questions", () => {
  it("« validées » suit la porte unique : compte les is_active (validées OU non) → 2", async () => {
    setup();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson<Summary>(res);
    expect(dig(body, "validated_questions")).toBe(2); // A, B
  });

  it("« à relire » reste sur le journal (les deux NULL) → 2, et PAS 3 comme le donnerait is_active=false", async () => {
    setup();
    const body = await readJson<Summary>(await GET());
    expect(dig(body, "pending_questions")).toBe(2); // B, C — pas D (rejetée) ni E (éteinte volontairement)
  });

  it("les filtres exacts : is_active seul d'un côté, validated_at/rejected_at NULL de l'autre", async () => {
    const db = setup();
    await GET();
    const counts = db.on("teacher_questions").filter((c) => c.isCount);
    expect(counts).toHaveLength(2);
    const byShape = counts.map((c) => c.filters.slice(1)); // sans le eq(teacher_id)
    expect(byShape).toContainEqual([["eq", "is_active", true]]);
    expect(byShape).toContainEqual([["is", "validated_at", null], ["is", "rejected_at", null]]);
    // Garde explicite : aucun compteur ne combine journal ET porte.
    for (const c of counts) {
      const cols = c.filters.map((f) => f[1]);
      const touchesJournal = cols.includes("validated_at") || cols.includes("rejected_at");
      const touchesGate = cols.includes("is_active");
      expect(touchesJournal && touchesGate).toBe(false);
    }
  });
});
