/**
 * Invariant 1 — Suppression de classe (DELETE /api/classes/[id]).
 *
 * Une classe ne peut être supprimée que si elle est archivée ET prouvablement
 * vide. Le fail-safe est le refus. Ces tests verrouillent le comportement livré
 * le 2026-09-02 (feat/class-delete-to-archive) pour qu'un refactor ne puisse
 * pas le casser en silence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, createFakeAuthClient, type RecordedCall } from "../helpers/supabase-mock";
import { makeRequest, readJson, isAllNumbers } from "../helpers/route";

const state = vi.hoisted(() => ({
  auth: null as unknown,
  admin: null as unknown,
}));

vi.mock("@/lib/supabase-server", () => ({ createClient: () => state.auth }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.admin }));

import { DELETE } from "@/app/api/classes/[id]/route";

// ── Les 7 compteurs de l'invariant, tels que livrés ─────────────────────────
// Ce tableau est volontairement dupliqué depuis la route (BLOCKER_TABLES n'est
// pas exporté) : si quelqu'un retire un compteur côté route, le test
// « exactement ces 7 tables » casse.
const BLOCKERS = [
  { table: "class_memberships",        column: "class_id",        key: "members" },
  { table: "assignments",              column: "class_id",        key: "assignments" },
  { table: "class_attendance_records", column: "class_id",        key: "attendance" },
  { table: "live_sessions",            column: "class_id",        key: "live_sessions" },
  { table: "classes",                  column: "parent_class_id", key: "child_classes" },
  { table: "teacher_schedule_slots",   column: "class_id",        key: "schedule_slots" },
  { table: "student_random_picks",     column: "class_id",        key: "random_picks" },
] as const;

type Table = (typeof BLOCKERS)[number]["table"];
type CountValue = number | null | "error";

const CLASS_ID = "11111111-1111-4111-8111-111111111111";
const TEACHER = { id: "teacher-1", email: "prof@example.test" };

type Scenario = {
  user?: { id: string; email?: string } | null;
  isTeacher?: boolean;
  owns?: boolean;
  archivedAt?: string | null;
  archivedReadError?: unknown;
  counts?: Partial<Record<Table, CountValue>>;
  deleteError?: unknown;
};

function setup(s: Scenario = {}) {
  const user = s.user === undefined ? TEACHER : s.user;
  state.auth = createFakeAuthClient({
    user,
    rpc: { is_current_user_school_teacher: s.isTeacher ?? true },
  });

  const db = createFakeSupabase((call: RecordedCall) => {
    // Ownership : select("id").eq(id).eq(teacher_id).single()
    if (call.table === "classes" && call.op === "select" && call.terminal === "single") {
      return (s.owns ?? true)
        ? { data: { id: CLASS_ID } }
        : { data: null, error: { code: "PGRST116", message: "0 rows" } };
    }
    // Lecture de archived_at : select("archived_at").eq(id).maybeSingle()
    if (call.table === "classes" && call.op === "select" && call.terminal === "maybeSingle") {
      if (s.archivedReadError) return { data: null, error: s.archivedReadError };
      return { data: { archived_at: s.archivedAt === undefined ? "2026-09-01T00:00:00Z" : s.archivedAt } };
    }
    // Compteurs
    if (call.isCount) {
      const v = s.counts?.[call.table as Table];
      if (v === "error") return { count: null, error: { message: "boom", code: "XX000" } };
      if (v === null) return { count: null, error: null }; // hoquet PostgREST : count null SANS erreur
      return { count: v ?? 0, error: null };
    }
    // Suppression
    if (call.table === "classes" && call.op === "delete") {
      return { error: s.deleteError ?? null };
    }
    return {};
  });
  state.admin = db.client;
  return db;
}

async function callDelete() {
  const res = await DELETE(makeRequest("DELETE", `http://localhost/api/classes/${CLASS_ID}`), {
    params: { id: CLASS_ID },
  });
  return { res, body: await readJson<Record<string, unknown>>(res) };
}

const deletesOn = (db: ReturnType<typeof setup>) =>
  db.calls.filter((c) => c.op === "delete");

beforeEach(() => {
  state.auth = null;
  state.admin = null;
});

// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/classes/[id] — gardes d'accès", () => {
  it("non authentifié → 401, et aucune requête admin n'est émise", async () => {
    const db = setup({ user: null });
    const { res, body } = await callDelete();
    expect(res.status).toBe(401);
    expect(body.error).toBe("Non authentifié");
    expect(db.calls).toHaveLength(0);
  });

  it("authentifié mais pas enseignant → 403, aucune requête admin", async () => {
    const db = setup({ isTeacher: false });
    const { res } = await callDelete();
    expect(res.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it("non propriétaire → 404, et les compteurs ne sont JAMAIS évalués avant l'ownership", async () => {
    const db = setup({ owns: false, counts: { class_memberships: 12 } });
    const { res, body } = await callDelete();
    expect(res.status).toBe(404);
    expect(body.error).toBe("Classe introuvable");
    // Sinon le 409 deviendrait un oracle de volumétrie sur les classes d'autrui.
    expect(db.counts()).toHaveLength(0);
    expect(deletesOn(db)).toHaveLength(0);
    // La seule requête admin est la vérification d'ownership elle-même.
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toMatchObject({ table: "classes", op: "select", terminal: "single" });
  });
});

describe("DELETE /api/classes/[id] — archivage préalable", () => {
  it("classe non archivée → 409 class_not_archived, aucun compteur évalué, pas de delete", async () => {
    const db = setup({ archivedAt: null });
    const { res, body } = await callDelete();
    expect(res.status).toBe(409);
    expect(body.code).toBe("class_not_archived");
    expect(db.counts()).toHaveLength(0);
    expect(deletesOn(db)).toHaveLength(0);
  });

  it("lecture de archived_at en erreur → 500, pas de delete", async () => {
    const db = setup({ archivedReadError: { message: "connection reset" } });
    const { res } = await callDelete();
    expect(res.status).toBe(500);
    expect(db.counts()).toHaveLength(0);
    expect(deletesOn(db)).toHaveLength(0);
  });
});

describe("DELETE /api/classes/[id] — classe non vide", () => {
  it("→ 409 class_not_empty, payload composé d'entiers uniquement, pas de delete", async () => {
    const db = setup({ counts: { class_memberships: 24, assignments: 7 } });
    const { res, body } = await callDelete();
    expect(res.status).toBe(409);
    expect(body.code).toBe("class_not_empty");
    // Aucune PII : que des nombres. Ni nom, ni email, ni id d'élève.
    expect(isAllNumbers(body.counts)).toBe(true);
    expect(Object.keys(body).sort()).toEqual(["code", "counts", "error"]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toMatch(/student_user_id|display_name|first_name|last_name/);
    expect(deletesOn(db)).toHaveLength(0);
  });

  it("le message d'erreur nomme les compteurs non nuls et parle d'archivage", async () => {
    setup({ counts: { class_memberships: 24, assignments: 7 } });
    const { body } = await callDelete();
    expect(String(body.error)).toMatch(/24 élèves/);
    expect(String(body.error)).toMatch(/7 devoirs/);
    expect(String(body.error)).toMatch(/archiv/i);
  });

  // Un test par compteur : chacun doit bloquer SEUL.
  for (const b of BLOCKERS) {
    it(`le compteur ${b.table} (${b.column}) bloque seul → 409, counts.${b.key} = 1, pas de delete`, async () => {
      const db = setup({ counts: { [b.table]: 1 } as Partial<Record<Table, CountValue>> });
      const { res, body } = await callDelete();
      expect(res.status).toBe(409);
      expect(body.code).toBe("class_not_empty");
      expect((body.counts as Record<string, number>)[b.key]).toBe(1);
      expect(deletesOn(db)).toHaveLength(0);
      // Le comptage a bien porté sur la bonne colonne.
      const c = db.counts().find((x) => x.table === b.table);
      expect(c).toBeDefined();
      expect(c!.filters).toEqual([["eq", b.column, CLASS_ID]]);
    });
  }

  it("class_memberships est compté TOUS statuts confondus (un membre 'removed' compte)", async () => {
    // Si quelqu'un ajoute .eq("status","active"), un prof peut vider sa classe
    // élève par élève puis la supprimer avec tout l'historique.
    const db = setup({ counts: { class_memberships: 1 } });
    await callDelete();
    const c = db.counts().find((x) => x.table === "class_memberships")!;
    expect(c.filters.some((f) => f[1] === "status")).toBe(false);
    expect(c.filters).toEqual([["eq", "class_id", CLASS_ID]]);
  });

  it("assignments est compté SANS filtre archived_at (un devoir archivé compte)", async () => {
    // Archiver un devoir conserve la ligne, ses completions et ses réponses.
    const db = setup({ counts: { assignments: 1 } });
    await callDelete();
    const c = db.counts().find((x) => x.table === "assignments")!;
    expect(c.filters.some((f) => f[1] === "archived_at")).toBe(false);
    expect(c.filters).toEqual([["eq", "class_id", CLASS_ID]]);
  });

  it("exactement ces 7 tables sont comptées — ni plus, ni moins", async () => {
    const db = setup();
    await callDelete();
    const counted = db.counts().map((c) => `${c.table}.${c.filters[0]?.[1]}`).sort();
    const expected = BLOCKERS.map((b) => `${b.table}.${b.column}`).sort();
    expect(counted).toEqual(expected);
  });

  it("class_audit_log n'est PAS compté — exception assumée, documentée dans la route", async () => {
    // Son trigger logge archived_at : archiver remplit la table, la compter
    // rendrait toute classe archivée insupprimable, y compris une coquille.
    // Fermeture définitive prévue par la PR 3 (ON DELETE RESTRICT).
    const db = setup();
    await callDelete();
    expect(db.on("class_audit_log")).toHaveLength(0);
  });
});

describe("DELETE /api/classes/[id] — fail-safe : le refus", () => {
  for (const b of BLOCKERS) {
    it(`compteur ${b.table} en ERREUR → 500 et PAS de delete`, async () => {
      const db = setup({ counts: { [b.table]: "error" } as Partial<Record<Table, CountValue>> });
      const { res, body } = await callDelete();
      expect(res.status).toBe(500);
      expect(body.error).toBe("Erreur serveur");
      expect(deletesOn(db)).toHaveLength(0);
    });
  }

  for (const b of BLOCKERS) {
    it(`compteur ${b.table} à count === null (sans erreur) → 500 et PAS de delete`, async () => {
      // C'est LE test anti-régression du fail-open : un `count ?? 0` réintroduit
      // transformerait ce null en 0, le garde passerait, la classe partirait.
      const db = setup({ counts: { [b.table]: null } as Partial<Record<Table, CountValue>> });
      const { res } = await callDelete();
      expect(res.status).toBe(500);
      expect(deletesOn(db)).toHaveLength(0);
    });
  }

  it("le delete lui-même en erreur → 500 (pas de faux succès)", async () => {
    const db = setup({ deleteError: { message: "FK violation", code: "23503" } });
    const { res } = await callDelete();
    expect(res.status).toBe(500);
    expect(deletesOn(db)).toHaveLength(1);
  });
});

describe("DELETE /api/classes/[id] — cas nominal", () => {
  it("classe archivée ET prouvablement vide → delete effectué, 200 { ok: true }", async () => {
    const db = setup();
    const { res, body } = await callDelete();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    const dels = deletesOn(db);
    expect(dels).toHaveLength(1);
    expect(dels[0]).toMatchObject({ table: "classes", op: "delete" });
    expect(dels[0].filters).toEqual([["eq", "id", CLASS_ID]]);
  });

  it("ordre des opérations : ownership → archived_at → 7 compteurs → delete", async () => {
    const db = setup();
    await callDelete();
    const seq = db.calls.map((c) =>
      c.op === "delete" ? "delete" : c.isCount ? "count" : `${c.table}:${c.terminal}`,
    );
    expect(seq[0]).toBe("classes:single");       // ownership
    expect(seq[1]).toBe("classes:maybeSingle");  // archived_at
    expect(seq.slice(2, 9).every((s) => s === "count")).toBe(true);
    expect(seq[9]).toBe("delete");
    expect(seq).toHaveLength(10);
  });
});
