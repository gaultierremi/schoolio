import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { getAdminClient } from "@/lib/db/admin-client";
import { resolveUserRole } from "@/lib/auth/role-resolver";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";
import ConfirmJoinClient from "./ConfirmJoinClient";

export const dynamic = "force-dynamic";

/**
 * /join/[token] — écran de confirmation de rattachement à une classe.
 *
 * Parcours : le QR code / le lien du prof mène ici. Si l'utilisateur n'est pas
 * connecté, le middleware (middleware.ts:55-66) l'envoie déjà sur
 * /login?next=/join/<token> ; le redirect ci-dessous est la défense en
 * profondeur, identique à app/join/page.tsx:20-23. Il n'y a PAS de branche
 * « inscription email/mot de passe » : ce sous-arbre est orphelin (carte board
 * dédiée pour son nettoyage), tout /join non authentifié part sur /login.
 *
 * Renvoi croisé : l'écriture est faite par POST /api/join/link. Les gates
 * lues ici sont un miroir READ-ONLY de celles de la route — la route reste
 * l'autorité, cette page ne fait que court-circuiter les cas terminaux pour ne
 * pas afficher un bouton qui échouera. Toute modification de gate doit être
 * répercutée des deux côtés (et sur /api/join, le jumeau indexé sur le code).
 */

/**
 * UUID v4 strict — PAS /^[0-9a-f-]{36}$/i, qui laisserait passer 36 tirets et
 * ferait remonter un 22P02 Postgres. Doit rester identique à celle de la route.
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

function TerminalScreen({
  emoji,
  title,
  message,
  ctaHref,
  ctaLabel,
}: {
  emoji: string;
  title: string;
  message: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[rgb(var(--surface-2))] px-4 py-12 text-center">
      <p className="text-5xl">{emoji}</p>
      <h1 className="serif mt-6 text-2xl font-bold text-[rgb(var(--ink))]">
        {title}
      </h1>
      <p className="mt-3 max-w-sm text-sm text-[rgb(var(--ink-2))]">{message}</p>
      <Link
        href={ctaHref}
        className="mt-6 inline-block rounded-2xl border border-[rgb(var(--border))] px-5 py-2.5 text-sm font-bold text-[rgb(var(--ink-2))] transition hover:text-[rgb(var(--ink))]"
      >
        {ctaLabel}
      </Link>
    </main>
  );
}

export default async function JoinTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = params.token;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  }

  // Validé AVANT toute requête : un token mal formé ne doit jamais atteindre
  // Postgres sur une colonne uuid.
  if (!UUID_RE.test(token)) {
    return (
      <TerminalScreen
        emoji="🔗"
        title="Lien invalide"
        message="Ce lien d'invitation n'est pas valide. Demande à ton professeur de te le renvoyer."
        ctaHref="/join"
        ctaLabel="Entrer un code à la place"
      />
    );
  }

  const admin = await getAdminClient();

  const { data, error: clsError } = await admin
    .from("classes")
    .select(
      "id, name, teacher_id, invitation_enabled, invitation_expires_at, archived_at",
    )
    .eq("invite_link_token", token)
    .maybeSingle();

  // Erreur DB testée SÉPARÉMENT de !cls : une panne ne doit pas être affichée
  // comme « lien introuvable ».
  if (clsError) {
    console.error("[join/[token]] select_class", clsError);
    return (
      <TerminalScreen
        emoji="⚠️"
        title="Service indisponible"
        message="Impossible de vérifier ce lien pour le moment. Réessaie dans un instant."
        ctaHref="/accueil"
        ctaLabel="← Retour à mon espace"
      />
    );
  }

  const cls = data as ClassRow | null;

  if (!cls) {
    return (
      <TerminalScreen
        emoji="🔗"
        title="Lien invalide"
        message="Ce lien d'invitation n'existe pas ou a été régénéré par le professeur."
        ctaHref="/join"
        ctaLabel="Entrer un code à la place"
      />
    );
  }

  // ── Gates, même ordre que la route ────────────────────────────────────────
  if (cls.archived_at) {
    return (
      <TerminalScreen
        emoji="📦"
        title="Classe archivée"
        message="Cette classe a été archivée par son professeur, il n'est plus possible de la rejoindre."
        ctaHref="/accueil"
        ctaLabel="← Retour à mon espace"
      />
    );
  }
  if (!cls.invitation_enabled) {
    return (
      <TerminalScreen
        emoji="🚪"
        title="Inscriptions fermées"
        message={`Le professeur a fermé les inscriptions pour « ${cls.name} ».`}
        ctaHref="/accueil"
        ctaLabel="← Retour à mon espace"
      />
    );
  }
  if (
    cls.invitation_expires_at &&
    new Date(cls.invitation_expires_at) < new Date()
  ) {
    return (
      <TerminalScreen
        emoji="⏳"
        title="Lien expiré"
        message="Ce lien d'invitation a expiré. Demande à ton professeur de t'en envoyer un nouveau."
        ctaHref="/join"
        ctaLabel="Entrer un code à la place"
      />
    );
  }

  // ── Garde prof/admin (miroir de la route) ─────────────────────────────────
  const email = (user.email ?? "").toLowerCase();
  const isSuperAdmin = (SUPER_ADMIN_EMAILS as readonly string[]).includes(email);

  const { data: profileData } = await admin
    .from("user_profiles")
    .select("id, role, user_name")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as {
    id: string;
    role: string | null;
    user_name: string | null;
  } | null;

  if (!isSuperAdmin) {
    if (cls.teacher_id === user.id) {
      return (
        <TerminalScreen
          emoji="🧑‍🏫"
          title="Tu es le professeur de cette classe"
          message={`« ${cls.name} » est ta classe — ce lien est destiné à tes élèves.`}
          ctaHref="/accueil"
          ctaLabel="← Retour à mon espace"
        />
      );
    }
    const role =
      profile?.role ?? (email ? await resolveUserRole(email) : "student");
    if (role === "teacher") {
      return (
        <TerminalScreen
          emoji="🧑‍🏫"
          title="Compte enseignant"
          message="Ce compte est un compte enseignant : il ne peut pas rejoindre une classe en tant qu'élève."
          ctaHref="/accueil"
          ctaLabel="← Retour à mon espace"
        />
      );
    }
  }

  const { data: membershipData } = await admin
    .from("class_memberships")
    .select("status")
    .eq("class_id", cls.id)
    .eq("student_user_id", user.id)
    .maybeSingle();
  const alreadyMember =
    (membershipData as { status: string } | null)?.status === "active";

  // Un compte peut être membre SANS avoir de profil ni de app_metadata.role
  // (comptes créés par le chemin join-full). Dans ce cas on n'affiche PAS
  // l'écran terminal : on laisse passer par le bouton, pour que la route fasse
  // le backfill profil + rôle — sinon l'élève retombe sur UnknownRoleScreen.
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const needsBackfill = !appMeta.role || !profile;

  if (alreadyMember && !needsBackfill) {
    return (
      <TerminalScreen
        emoji="✅"
        title="Tu es déjà dans cette classe"
        message={`Tu fais déjà partie de « ${cls.name} ». Rien à faire de plus.`}
        ctaHref="/accueil"
        ctaLabel="→ Aller à mon espace"
      />
    );
  }

  let teacherName: string | undefined;
  if (cls.teacher_id) {
    const { data: teacherProfile } = await admin
      .from("user_profiles")
      .select("user_name")
      .eq("id", cls.teacher_id)
      .maybeSingle();
    teacherName =
      (teacherProfile as { user_name: string | null } | null)?.user_name ??
      undefined;
  }

  return (
    <ConfirmJoinClient
      token={token}
      className={cls.name}
      teacherName={teacherName}
      userEmail={user.email ?? ""}
      alreadyMember={alreadyMember}
    />
  );
}
