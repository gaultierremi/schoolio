import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowLeft, GraduationCap, Mail, School, UserCircle, Users } from "lucide-react";
import { getUserWithRole } from "@/lib/auth/role";
import SignOutButton from "@/app/accueil/_components/eleve/SignOutButton";

export const dynamic = "force-dynamic";

/**
 * Page "Mon compte" — vue read-only des infos compte essentielles.
 *
 * Conforme mémoire `feedback_no_student_profile_route` : pas d'édition profil
 * en self-service pour l'élève (sauf user_menu modal futur). Cette page
 * affiche les données existantes + classes membre + signout.
 *
 * Accessible aux deux rôles (élève + prof). L'auth est déjà gardée par le
 * middleware (toute route /accueil/* exige user authentifié).
 */

type ClassRow = {
  id: string;
  name: string;
  level: number | null;
  subject: string | null;
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function fetchUserClasses(
  userId: string,
  role: "student" | "teacher" | null,
): Promise<ClassRow[]> {
  const admin = createAdminClient();

  if (role === "student") {
    const { data } = await admin
      .from("class_memberships")
      .select("classes!inner(id, name, level, subject)")
      .eq("student_user_id", userId)
      .eq("status", "active");

    type MembershipRow = { classes: ClassRow };
    return ((data ?? []) as unknown as MembershipRow[]).map((row) => row.classes);
  }

  if (role === "teacher") {
    const { data } = await admin
      .from("classes")
      .select("id, name, level, subject")
      .eq("teacher_id", userId)
      .is("archived_at", null);
    return (data ?? []) as ClassRow[];
  }

  return [];
}

export default async function MonComptePage() {
  const { user, role } = await getUserWithRole();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("first_name, last_name, pseudo")
    .eq("id", user.id)
    .maybeSingle();

  const meta = user.user_metadata as Record<string, unknown>;
  const displayName =
    (profile as { first_name?: string | null } | null)?.first_name ??
    (meta?.firstName as string | undefined) ??
    (meta?.full_name as string | undefined) ??
    (meta?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Utilisateur";

  const pseudo =
    (profile as { pseudo?: string | null } | null)?.pseudo ??
    (meta?.pseudo as string | undefined) ??
    null;

  const classes = await fetchUserClasses(user.id, role);

  const roleLabel =
    role === "student" ? "Élève" : role === "teacher" ? "Professeur" : "Compte en attente d'activation";

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:py-12">
      <Link
        href="/accueil"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Accueil
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Mon compte
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Tes informations Maïa.
      </p>

      <section className="mt-8 space-y-1 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <Row icon={<UserCircle size={18} strokeWidth={1.5} />} label="Nom" value={displayName} />
        {pseudo && <Row icon={<UserCircle size={18} strokeWidth={1.5} />} label="Pseudo" value={pseudo} />}
        {user.email && <Row icon={<Mail size={18} strokeWidth={1.5} />} label="Email" value={user.email} />}
        <Row icon={<GraduationCap size={18} strokeWidth={1.5} />} label="Rôle" value={roleLabel} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <School size={16} strokeWidth={1.75} />
          {role === "teacher" ? "Classes que tu enseignes" : "Tes classes"}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {classes.length}
          </span>
        </div>

        {classes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            {role === "teacher"
              ? "Tu n'as pas encore créé de classe."
              : role === "student"
                ? "Tu n'es membre d'aucune classe pour l'instant."
                : "Aucune classe associée à ce compte."}
          </div>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {c.name}
                  </p>
                  {(c.subject || c.level) && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {[c.subject, c.level ? `Niveau ${c.level}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <Users size={16} strokeWidth={1.5} className="text-slate-400" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
        <SignOutButton />
      </section>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {value}
        </p>
      </div>
    </div>
  );
}
