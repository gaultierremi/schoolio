import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiOk, safeError } from "@/lib/api/respond";
import { getAdminClient } from "@/lib/db/admin-client";
import { logActivity } from "@/lib/activity/log";
import { resolveUserRole } from "@/lib/auth/role-resolver";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";

export const dynamic = "force-dynamic";

// POST /api/join/link — auth required. Body: { token: string (uuid) }
//
// Rattache un utilisateur DÉJÀ authentifié (SSO Google) à la classe désignée
// par `classes.invite_link_token`.
//
// ── Renvoi croisé ────────────────────────────────────────────────────────────
// Jumeau de POST /api/join, qui fait la même chose indexé sur
// `classes.invitation_code` (le chemin « code à 8 caractères »). Les deux
// routes sont volontairement auto-portées (pas de lib/join-student.ts partagée)
// tant que les deux parcours n'ont pas été unifiés — carte board « Unifier les
// deux chemins de join » ouverte pour ça. Si tu corriges un bug de gate ou
// d'écriture ici, va vérifier l'autre. Cette route est la version durcie :
// - chaque write est testé (le gabarit /api/join renvoie 200 sans vérifier),
// - les gates sont séparées avec un `reason` machine-lisible,
// - la garde prof/admin passe AVANT toute écriture.
//
// NOTE : pas de gate sur `classes.auth_mode` — il vaut toujours 'full'.

/** Codes machine-lisibles consommés par app/join/[token]/page.tsx et son client. */
type JoinReason =
  | "invalid_token"
  | "not_found"
  | "archived"
  | "invitations_closed"
  | "expired"
  | "is_class_teacher"
  | "is_teacher";

/**
 * Variante locale d'apiError() qui ajoute `reason`.
 *
 * Règle 6 respectée : le message reste une constante côté serveur, aucun
 * err.message n'atteint le client (les erreurs inattendues passent par
 * safeError()). `reason` existe parce que la page a besoin de choisir un écran
 * terminal sans parser du français. lib/api/respond.ts n'est pas modifié :
 * hors périmètre de ce sprint (règle 22).
 */
function joinError(reason: JoinReason, message: string, status: number): NextResponse {
  return NextResponse.json({ error: message, reason }, { status });
}

/**
 * UUID v4 strict — PAS /^[0-9a-f-]{36}$/i, qui accepte 36 tirets et fait
 * remonter un 22P02 (invalid_text_representation) depuis Postgres au lieu d'un
 * 400 propre. `invite_link_token` est une colonne uuid.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClassRow = {
  id: string;
  name: string;
  teacher_id: string | null;
  invitation_enabled: boolean | null;
  invitation_expires_at: string | null;
  archived_at: string | null;
};

export async function POST(req: NextRequest) {
  // Règle 4 : check d'auth en première instruction.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user, email } = auth;

  try {
    const body = (await req.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!UUID_RE.test(token)) {
      return joinError("invalid_token", "Lien d'invitation invalide", 400);
    }

    const admin = await getAdminClient();

    // ── Lecture de la classe ────────────────────────────────────────────────
    // L'erreur du select est testée SÉPARÉMENT de !cls : une panne DB ne doit
    // pas être maquillée en « lien introuvable ».
    const { data, error: clsError } = await admin
      .from("classes")
      .select(
        "id, name, teacher_id, invitation_enabled, invitation_expires_at, archived_at",
      )
      .eq("invite_link_token", token)
      .maybeSingle();

    if (clsError) return safeError(clsError, "api/join/link:select_class");

    const cls = data as ClassRow | null;
    if (!cls) {
      return joinError("not_found", "Lien invalide ou classe introuvable", 404);
    }

    // ── Gates, dans l'ordre, AVANT toute écriture ───────────────────────────
    if (cls.archived_at) {
      return joinError("archived", "Cette classe a été archivée", 410);
    }
    if (!cls.invitation_enabled) {
      return joinError(
        "invitations_closed",
        "Les inscriptions sont fermées pour cette classe",
        403,
      );
    }
    if (
      cls.invitation_expires_at &&
      new Date(cls.invitation_expires_at) < new Date()
    ) {
      return joinError("expired", "Ce lien d'invitation a expiré", 410);
    }

    // ── Profil : lu ici parce que la garde prof en a besoin AVANT d'écrire ──
    const { data: profileData, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return safeError(profileError, "api/join/link:select_profile");
    }
    const profile = profileData as { id: string; role: string | null } | null;

    // ── Garde prof/admin, AVANT toute écriture ──────────────────────────────
    // Les SUPER_ADMIN_EMAILS ne sont PAS bloqués : le middleware leur ouvre
    // déjà /admin et /accueil sans regarder leur rôle (middleware.ts:78-89)
    // précisément pour le dogfooding — un fondateur doit pouvoir rejoindre une
    // classe de test avec son propre compte pour voir l'app côté élève.
    const isSuperAdmin = (SUPER_ADMIN_EMAILS as readonly string[]).includes(email);

    if (!isSuperAdmin) {
      if (cls.teacher_id === user.id) {
        return joinError(
          "is_class_teacher",
          "Tu es le professeur de cette classe",
          403,
        );
      }
      // profile.role fait foi quand le profil existe ; resolveUserRole() n'est
      // qu'un fallback pour un compte SSO qui n'a pas encore de user_profiles
      // (founder_teachers whitelist).
      const role = profile?.role ?? (email ? await resolveUserRole(email) : "student");
      if (role === "teacher") {
        return joinError(
          "is_teacher",
          "Ce compte est un compte enseignant",
          403,
        );
      }
    }

    // ── À partir d'ici : écritures. Chaque erreur est testée. ───────────────
    // Aucun early-return sur « déjà membre » avant d'avoir garanti le profil
    // ET app_metadata.role : un compte créé par le chemin join-full déjà
    // membre resterait sinon sans rôle → UnknownRoleScreen au retour.

    // Règle 3 (CLAUDE.md) : le rôle vit dans app_metadata (service-role only),
    // jamais dans user_metadata (client-mutable = self-promotion).
    const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
    if (!appMeta.role) {
      const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...appMeta, role: "student" },
      });
      if (metaError) return safeError(metaError, "api/join/link:app_metadata");
    }

    if (!profile) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const displayName =
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        email.split("@")[0];

      const { error: upsertProfileError } = await admin
        .from("user_profiles")
        .upsert({
          id: user.id,
          user_name: displayName,
          first_name: (meta.given_name as string | undefined) ?? null,
          last_name: (meta.family_name as string | undefined) ?? null,
          role: "student",
          auth_mode: "full",
          avatar_color: "#a855f7",
          streak: 0,
          total_games: 0,
          total_score: 0,
        });
      if (upsertProfileError) {
        return safeError(upsertProfileError, "api/join/link:upsert_profile");
      }
    }

    // ── Membership ──────────────────────────────────────────────────────────
    const { data: existingData, error: existingError } = await admin
      .from("class_memberships")
      .select("id, status")
      .eq("class_id", cls.id)
      .eq("student_user_id", user.id)
      .maybeSingle();

    if (existingError) {
      return safeError(existingError, "api/join/link:select_membership");
    }
    const existing = existingData as { id: string; status: string } | null;

    const alreadyMember = existing?.status === "active";
    const reactivated = existing?.status === "removed";

    if (!alreadyMember) {
      // onConflict explicite : sur réactivation, seul `status` est écrit, donc
      // joined_at d'origine est préservé (règle 23 — never-DELETE, l'historique
      // longitudinal doit rester lisible).
      const { error: membershipError } = await admin
        .from("class_memberships")
        .upsert(
          { class_id: cls.id, student_user_id: user.id, status: "active" },
          { onConflict: "class_id,student_user_id" },
        );

      if (membershipError) {
        // 23505 = unique_violation : une requête concurrente a déjà créé la
        // membership. L'état visé EST atteint → succès, pas erreur.
        const code = (membershipError as { code?: string }).code;
        if (code !== "23505") {
          return safeError(membershipError, "api/join/link:upsert_membership");
        }
      }
    }

    // Log uniquement sur changement d'état réel : un re-clic sur le lien par un
    // élève déjà actif ne doit pas polluer les stats de rétention.
    if (!alreadyMember && typeof cls.teacher_id === "string") {
      await logActivity({
        event_type: "student_joined_class",
        actor_id: user.id,
        actor_type: "student",
        target_type: "class",
        target_id: cls.id,
        teacher_id: cls.teacher_id,
        context: { via: "invite_link", reactivated },
      });
    }

    return apiOk({
      ok: true,
      class_name: cls.name,
      already_member: alreadyMember,
      reactivated,
    });
  } catch (err) {
    return safeError(err, "api/join/link:POST");
  }
}
