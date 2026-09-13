/**
 * Invariant 2 — Porte unique : POST /api/curation/[id]/toggle-active.
 *
 * Si activer suffit à diffuser, activer doit horodater la revue — sinon la
 * question est servie aux élèves tout en restant éternellement « à relire ».
 * Asymétrie voulue : désactiver ne touche PAS le journal. Éteindre est un geste
 * de diffusion, pas de revue ; effacer validated_at renverrait dans la file des
 * questions déjà relues (un chapitre éteint en septembre, rallumé en mars).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type RecordedCall } from "../helpers/supabase-mock";
import { makeRequest, readJson } from "../helpers/route";

const state = vi.hoisted(() => ({ auth: null as unknown, admin: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ createClient: () => state.auth }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.admin }));

import { POST } from "@/app/api/curation/[id]/toggle-active/route";

const QID = "12345678-1234-4123-8123-123456789abc";
const TEACHER = { id: "teacher-1", email: "prof@example.test", app_metadata: { role: "teacher" } };

function setup(user: typeof TEACHER | { id: string; app_metadata: Record<string, unknown> } = TEACHER) {
  // La route écrit via le client AUTHENTIFIÉ (RLS porte l'ownership), pas via
  // service role. Le faux client auth doit donc savoir faire .from().
  const auth = createFakeSupabase((call: RecordedCall) => {
    if (call.table === "teacher_questions" && call.op === "update") {
      const payload = call.args[0] as { is_active: boolean };
      return { data: { id: QID, is_active: payload.is_active }, error: null };
    }
    return {};
  });
  auth.client.auth.getUser = async () => ({ data: { user: user as never }, error: null });
  state.auth = auth.client;

  const admin = createFakeSupabase(() => ({})); // audit_log
  state.admin = admin.client;
  return { auth, admin };
}

async function toggle(is_active: boolean) {
  const res = await POST(makeRequest("POST", `http://localhost/api/curation/${QID}/toggle-active`, { is_active }), { params: { id: QID } });
  return { res, body: await readJson<{ ok?: boolean; is_active?: boolean; error?: string }>(res) };
}

const updatePayload = (db: ReturnType<typeof setup>) =>
  db.auth.on("teacher_questions").find((c) => c.op === "update")?.args[0] as Record<string, unknown>;

beforeEach(() => { state.auth = null; state.admin = null; });

describe("toggle-active — le journal de revue", () => {
  it("ACTIVER pose validated_at (horodatage ISO) et efface rejected_at", async () => {
    const db = setup();
    const { res, body } = await toggle(true);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, is_active: true });
    const p = updatePayload(db);
    expect(p.is_active).toBe(true);
    expect(typeof p.validated_at).toBe("string");
    expect(Number.isNaN(Date.parse(p.validated_at as string))).toBe(false);
    expect(p.rejected_at).toBeNull();
  });

  it("DÉSACTIVER ne touche pas le journal : le payload est exactement { is_active: false }", async () => {
    const db = setup();
    await toggle(false);
    expect(updatePayload(db)).toEqual({ is_active: false });
  });

  it("l'update est scopé sur id ET teacher_id (ownership dans la requête, pas seulement en RLS)", async () => {
    const db = setup();
    await toggle(true);
    const u = db.auth.on("teacher_questions").find((c) => c.op === "update")!;
    expect(u.filters).toEqual([["eq", "id", QID], ["eq", "teacher_id", TEACHER.id]]);
  });

  it("un compte non enseignant → 403, aucune écriture", async () => {
    const db = setup({ id: "student-1", app_metadata: { role: "student" } });
    const { res } = await toggle(true);
    expect(res.status).toBe(403);
    expect(db.auth.writes()).toHaveLength(0);
    expect(db.admin.writes()).toHaveLength(0);
  });
});
