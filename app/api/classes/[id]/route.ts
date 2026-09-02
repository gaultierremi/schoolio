import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function assertTeacherOwns(
  admin: ReturnType<typeof createAdminClient>,
  classId: string,
  teacherId: string
): Promise<boolean> {
  const { data } = await admin
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", teacherId)
    .single();
  return data !== null;
}

// ── Invariant anti-destruction ────────────────────────────────────────────────
//
// Supprimer une classe déclenche une cascade FK qui détruit définitivement
// class_memberships, assignments (et derrière : assignment_completions,
// assignment_question_answers, assignment_questions), class_attendance_records
// et student_random_picks — soit 4 des 7 tables que la règle 23 de CLAUDE.md
// déclare never-DELETE. Le DELETE n'est donc autorisé que sur une classe
// prouvablement vide.
//
// ⚠️ Cet invariant vit dans la ROUTE, pas dans la base. La policy RLS
// `teacher_deletes_own_classes` (20260508100000:79, FOR DELETE sans clause TO)
// reste ouverte au client anon-key : un DELETE PostgREST direct contourne
// entièrement ce fichier. Seule la PR 3 (FK ON DELETE RESTRICT + DROP POLICY)
// ferme réellement le trou.

export type ClassBlockerCounts = {
  members: number;
  assignments: number;
  attendance: number;
  live_sessions: number;
  child_classes: number;
  schedule_slots: number;
  random_picks: number;
};

const BLOCKER_TABLES: ReadonlyArray<{
  key: keyof ClassBlockerCounts;
  table: string;
  column: string;
}> = [
  // Tous statuts confondus. "Retirer" un élève écrit status='removed'
  // (classes/[id]/members, student/classes/[id]/leave) — la ligne reste, et son
  // historique de notes avec. Filtrer sur 'active' laisserait un prof vider sa
  // classe élève par élève puis la supprimer : le trou qu'on ferme ici.
  { key: "members", table: "class_memberships", column: "class_id" },
  // PAS de filtre archived_at : archiver un devoir écrit archived_at et
  // conserve la ligne (assignments/[assignmentId] fait un update, pas un
  // delete), donc completions et réponses sont toujours là — ça compte.
  { key: "assignments", table: "assignments", column: "class_id" },
  { key: "attendance", table: "class_attendance_records", column: "class_id" },
  // live_sessions.class_id est ON DELETE SET NULL, pas CASCADE : ce compteur ne
  // protège pas contre une destruction mais contre la perte du rattachement
  // session <-> classe (traçabilité, esprit de la règle 23).
  { key: "live_sessions", table: "live_sessions", column: "class_id" },
  // Cohorte parente : 0 élève et 0 devoir en propre, mais ses sous-classes
  // portent tout l'historique. La cascade SET NULL sur parent_class_id
  // (20260514180000:22) les orphelinerait en silence.
  { key: "child_classes", table: "classes", column: "parent_class_id" },
  // teacher_schedule_slots.class_id est SET NULL, et la table porte
  // CHECK (class_id IS NOT NULL OR subject_label IS NOT NULL) (20260509140000:16).
  // Un créneau rattaché à une classe a subject_label NULL : la cascade
  // violerait le CHECK -> 23514 -> 500 opaque pour le prof.
  { key: "schedule_slots", table: "teacher_schedule_slots", column: "class_id" },
  { key: "random_picks", table: "student_random_picks", column: "class_id" },
];

// class_audit_log cascade lui aussi depuis classes et n'est VOLONTAIREMENT pas
// compté : son trigger logge archived_at (20260514200000), donc archiver une
// classe remplit la table. La compter rendrait toute classe archivée
// définitivement insupprimable — y compris une coquille créée par erreur, alors
// que c'est le seul cas où la suppression est légitime. Exception à la règle 23
// assumée : l'audit d'une classe sans élève, sans devoir et sans présence
// n'enregistre que des renommages, aucune donnée pédagogique longitudinale.

/**
 * Compte tout ce que la suppression détruirait ou orphelinerait.
 * Renvoie `null` si UN SEUL comptage échoue — le fail-safe est le REFUS :
 * un `count ?? 0` transformerait un hoquet PostgREST (count null sans erreur)
 * en feu vert de suppression pour une classe pleine.
 */
async function countClassBlockers(
  admin: ReturnType<typeof createAdminClient>,
  classId: string
): Promise<ClassBlockerCounts | null> {
  const results = await Promise.all(
    BLOCKER_TABLES.map(async ({ table, column }) => {
      const { count, error } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(column, classId);
      if (error) {
        console.error(`[class:blockers] comptage ${table}`, error);
        return null;
      }
      return count;
    })
  );

  const counts = {} as ClassBlockerCounts;
  for (let i = 0; i < BLOCKER_TABLES.length; i++) {
    const value = results[i];
    if (value === null || value === undefined) return null;
    counts[BLOCKER_TABLES[i].key] = value;
  }
  return counts;
}

function isClassEmpty(counts: ClassBlockerCounts): boolean {
  return Object.values(counts).every((n) => n === 0);
}

/** Rend les compteurs non nuls en français. Que des nombres — aucune PII. */
function describeBlockers(counts: ClassBlockerCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  const parts: string[] = [];
  if (counts.members > 0) parts.push(plural(counts.members, "élève", "élèves"));
  if (counts.assignments > 0) parts.push(plural(counts.assignments, "devoir", "devoirs"));
  if (counts.attendance > 0) parts.push(plural(counts.attendance, "relevé de présence", "relevés de présence"));
  if (counts.live_sessions > 0) parts.push(plural(counts.live_sessions, "session live", "sessions live"));
  if (counts.child_classes > 0) parts.push(plural(counts.child_classes, "sous-classe", "sous-classes"));
  if (counts.schedule_slots > 0) parts.push(plural(counts.schedule_slots, "créneau d'horaire", "créneaux d'horaire"));
  if (counts.random_picks > 0) parts.push(plural(counts.random_picks, "tirage au sort", "tirages au sort"));
  return parts.join(", ");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const [classRes, membersRes] = await Promise.all([
      admin
        .from("classes")
        .select("id, name, level, subject, auth_mode, invite_code, invitation_code, invite_link_token, archived_at, created_at, updated_at")
        .eq("id", params.id)
        .eq("teacher_id", user.id)
        .single(),
      admin
        .from("class_memberships")
        .select("id, student_user_id, joined_at, status")
        .eq("class_id", params.id),
    ]);

    if (classRes.error) {
      if (classRes.error.code === "PGRST116") {
        return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
      }
      throw classRes.error;
    }

    const rawMembers = membersRes.data ?? [];
    const studentIds = rawMembers.map((m) => m.student_user_id);

    type ProfileRow = { id: string; first_name: string | null; last_name: string | null; user_name: string | null };
    const profileMap = new Map<string, ProfileRow>();
    if (studentIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, user_name")
        .in("id", studentIds);
      for (const p of (profiles ?? []) as ProfileRow[]) profileMap.set(p.id, p);
    }

    function buildDisplayName(p: ProfileRow | undefined): string {
      if (!p) return "—";
      if (p.first_name) return [p.first_name, p.last_name].filter(Boolean).join(" ");
      return p.user_name ?? "—";
    }

    const members = rawMembers
      .map((m) => ({
        ...m,
        display_name: buildDisplayName(profileMap.get(m.student_user_id)),
        _sortLast: (profileMap.get(m.student_user_id)?.last_name ?? "").toLowerCase(),
        _sortFirst: (profileMap.get(m.student_user_id)?.first_name ?? profileMap.get(m.student_user_id)?.user_name ?? "").toLowerCase(),
      }))
      .sort((a, b) => {
        const lc = a._sortLast.localeCompare(b._sortLast, "fr", { sensitivity: "base" });
        if (lc !== 0) return lc;
        return a._sortFirst.localeCompare(b._sortFirst, "fr", { sensitivity: "base" });
      })
      .map(({ _sortLast: _l, _sortFirst: _f, ...rest }) => rest);

    // Compteurs de l'invariant anti-destruction : l'UI en a besoin pour gater
    // le bouton "Supprimer" sur EXACTEMENT le même jeu que le serveur.
    // `null` si un comptage échoue -> l'UI désactive le bouton (fail-safe).
    // La requête classe porte déjà .eq("teacher_id", user.id) et on ne renvoie
    // rien si elle échoue : pas d'oracle de volumétrie sur la classe d'autrui.
    const counts = await countClassBlockers(admin, params.id);

    return NextResponse.json({ class: classRes.data, members, counts });
  } catch (err) {
    console.error("[class:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const owns = await assertTeacherOwns(admin, params.id, user.id);
    if (!owns) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
      }
      updates.name = name;
    }
    if ("level" in body) updates.level = body.level ?? null;
    if ("subject" in body) updates.subject = body.subject ?? null;
    if ("archived" in body) {
      updates.archived_at = body.archived ? new Date().toISOString() : null;
    }

    const { data: updated, error } = await admin
      .from("classes")
      .update(updates)
      .eq("id", params.id)
      .select("id, name, level, subject, auth_mode, invite_code, invitation_code, invite_link_token, archived_at, created_at, updated_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ class: updated });
  } catch (err) {
    console.error("[class:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const owns = await assertTeacherOwns(admin, params.id, user.id);
    if (!owns) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    // Tout ce qui suit s'exécute APRÈS la garde d'ownership, jamais en
    // parallèle d'elle : lancés ensemble, les compteurs feraient du 409 un
    // oracle d'existence et de volumétrie sur les classes d'un autre prof.

    const { data: cls, error: clsError } = await admin
      .from("classes")
      .select("archived_at")
      .eq("id", params.id)
      .maybeSingle();
    if (clsError || !cls) {
      console.error("[class:DELETE] lecture archived_at", clsError);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }

    // Archiver d'abord. Une classe archivée refuse les nouvelles inscriptions
    // (api/join:45, join-full:87), ce qui ferme la fenêtre de course entre le
    // comptage ci-dessous et le DELETE : personne ne peut rejoindre entretemps.
    if (cls.archived_at === null) {
      return NextResponse.json(
        {
          error: "Archive d'abord cette classe, puis supprime-la.",
          code: "class_not_archived",
        },
        { status: 409 }
      );
    }

    const counts = await countClassBlockers(admin, params.id);
    if (counts === null) {
      // Comptage impossible => on ne sait pas si la classe est vide => on
      // refuse. Le fail-safe est le refus, jamais la suppression.
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }

    if (!isClassEmpty(counts)) {
      return NextResponse.json(
        {
          error:
            `Cette classe contient encore des données (${describeBlockers(counts)}). ` +
            `Elle ne peut pas être supprimée : elle reste archivée, ses données sont conservées.`,
          code: "class_not_empty",
          counts,
        },
        { status: 409 }
      );
    }

    const { error } = await admin.from("classes").delete().eq("id", params.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[class:DELETE]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
