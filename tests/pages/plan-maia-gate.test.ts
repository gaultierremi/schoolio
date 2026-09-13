/**
 * Invariant 2 — Porte unique : Plan Maïa re-filtre au SERVICE (today, quiz).
 *
 * Le plan du jour est figé le matin. Sans re-gate, une question désactivée par
 * le prof en cours de journée restait servie jusqu'au lendemain. Et le re-gate
 * introduit un cas nouveau — zéro question servable — qui a d'abord produit une
 * boucle de redirection infinie quiz ↔ bilan (0 >= 0 → bilan → aucune réponse →
 * quiz…). Ces tests tiennent les deux : la question désactivée disparaît, et un
 * plan vidé ne boucle pas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "../helpers/supabase-mock";
import { datasetHandler, type Dataset } from "../helpers/rows";

const state = vi.hoisted(() => ({ admin: null as unknown }));

// tsconfig a jsx:"preserve" → sous vitest, esbuild émet React.createElement (runtime
// classique) et les pages n'importent pas React explicitement (Next l'injecte).
// On expose donc React en global AVANT l'import des pages. Test-only.
vi.hoisted(async () => {
  const mod = await import("react");
  (globalThis as Record<string, unknown>).React = mod.default ?? mod;
});

class RedirectSentinel extends Error {
  constructor(public readonly to: string) { super(`REDIRECT:${to}`); }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new RedirectSentinel(to); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/auth/role", () => ({
  requireStudentPage: async () => ({ user: { id: "student-1" }, role: "student" }),
}));
vi.mock("@/lib/plan-maia-date", () => ({ todayInBelgium: () => "2026-09-13" }));
vi.mock("@/lib/plan-maia-validation", () => ({ isValidPlanRow: () => true }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.admin }));

import PlanMaiaTodayPage from "@/app/accueil/plan-maia/today/page";
import PlanMaiaQuizPage from "@/app/accueil/plan-maia/today/quiz/page";

const PLAN = {
  id: "plan-1", user_id: "student-1", plan_date: "2026-09-13",
  plan_data: { question_ids: ["q1", "q2"], reasons_by_question_id: {}, concept_breakdown: { faible: 1, revision: 1, nouveau: 0 }, estimated_minutes: 10 },
  target_minutes: 10, completed_count: 0, completed_at: null,
};
const Q1 = { id: "q1", question: "Q1 ?", type: "mcq", options: ["a", "b"], numeric_unit: null, difficulty_stars: 1, subject_enum: "bio", concept_id: "c1", image_url: null, image_description_md: null, image_page_number: null, is_active: true };
const Q2 = { ...Q1, id: "q2", question: "Q2 ?", is_active: true };

function setup(questions: Array<Record<string, unknown>>) {
  const dataset: Dataset = { plan_maia_daily: [PLAN], teacher_questions: questions, plan_maia_answers: [] };
  const db = createFakeSupabase(datasetHandler(dataset));
  state.admin = db.client;
  return db;
}

async function redirectOf(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { if (e instanceof RedirectSentinel) return e.to; throw e; }
}

/** Cherche une chaîne dans un arbre d'éléments React (sans rendu DOM). */
function treeContains(node: unknown, text: string): boolean {
  if (node == null || typeof node === "boolean") return false;
  if (typeof node === "string") return node.includes(text);
  if (typeof node === "number") return String(node).includes(text);
  if (Array.isArray(node)) return node.some((n) => treeContains(n, text));
  if (typeof node === "object" && "props" in (node as object)) {
    const props = (node as { props: Record<string, unknown> }).props;
    return treeContains(props.children, text);
  }
  return false;
}

beforeEach(() => { state.admin = null; });

describe("Plan Maïa — page quiz", () => {
  it("une question désactivée dans la journée n'est plus servie (re-gate au service)", async () => {
    const db = setup([Q1, { ...Q2, is_active: false }]);
    // Le plan a 2 ids, 1 seul est actif : la page ne redirige pas et lit bien is_active.
    const to = await redirectOf(() => PlanMaiaQuizPage());
    expect(to).toBeNull();
    const q = db.on("teacher_questions")[0];
    expect(q.filters).toEqual([["in", "id", ["q1", "q2"]], ["eq", "is_active", true]]);
  });

  it("plan vidé par le re-gate (0 question servable) → redirige vers /today, JAMAIS vers /bilan (pas de boucle)", async () => {
    setup([{ ...Q1, is_active: false }, { ...Q2, is_active: false }]);
    const to = await redirectOf(() => PlanMaiaQuizPage());
    expect(to).toBe("/accueil/plan-maia/today");
    expect(to).not.toBe("/accueil/plan-maia/today/bilan");
  });
});

describe("Plan Maïa — page du jour", () => {
  it("lit les questions du plan avec le filtre is_active", async () => {
    const db = setup([Q1, Q2]);
    await PlanMaiaTodayPage();
    const q = db.on("teacher_questions")[0];
    expect(q.filters).toEqual([["in", "id", ["q1", "q2"]], ["eq", "is_active", true]]);
  });

  it("plan vidé → ne redirige pas, affiche l'état vide explicite au lieu du CTA « Démarrer »", async () => {
    setup([{ ...Q1, is_active: false }, { ...Q2, is_active: false }]);
    let tree: unknown = null;
    const to = await redirectOf(async () => { tree = await PlanMaiaTodayPage(); });
    expect(to).toBeNull();
    expect(treeContains(tree, "n'est plus disponible")).toBe(true);
    expect(treeContains(tree, "Démarrer le quiz")).toBe(false);
  });

  it("plan non vide → le CTA « Démarrer le quiz » est bien là", async () => {
    setup([Q1, Q2]);
    const tree = await PlanMaiaTodayPage();
    expect(treeContains(tree, "Démarrer le quiz")).toBe(true);
    expect(treeContains(tree, "n'est plus disponible")).toBe(false);
  });
});
