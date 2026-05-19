import Link from "next/link";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { requireStudentPage } from "@/lib/auth/role";
import JoinClassForm from "@/app/join/JoinClassForm";

export const dynamic = "force-dynamic";

/**
 * Sprint 6 PR S6-4 — Étape d'onboarding "Rejoindre ta classe".
 *
 * Distinct de `/join` (post-login générique) car :
 * - Affiche aussi les classes déjà rejointes (l'élève peut voir où il en est)
 * - Permet de skip (rejoindre plus tard via QR)
 * - CTA "Continuer vers mon accueil" en pied de page
 *
 * Réutilise `JoinClassForm` (DRY).
 *
 * UX onboarding : étape facultative — l'élève peut continuer sans rejoindre
 * (cas QR plus tard, ou élève qui découvre Maïa solo).
 */
export const metadata = {
  title: "Rejoindre une classe · Maïa",
};

export default async function OnboardingJoinClassPage() {
  const { user } = await requireStudentPage();

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Récupère les classes déjà rejointes (status='active')
  const membershipsRes = await admin
    .from("class_memberships")
    .select("class_id, status, classes(name, teacher_id)")
    .eq("student_user_id", user.id)
    .eq("status", "active");
  if (membershipsRes.error) throw membershipsRes.error;

  // Supabase typing : les jointures FK 1-to-N sont retournées en array
  // (même si en réalité 1-to-1 ici). On normalise via [0].
  type MembershipRaw = {
    class_id: string;
    status: string;
    classes: { name: string; teacher_id: string }[] | null;
  };
  type Membership = {
    class_id: string;
    status: string;
    classes: { name: string; teacher_id: string } | null;
  };
  const rawMemberships = (membershipsRes.data as MembershipRaw[] | null) ?? [];
  const memberships: Membership[] = rawMemberships.map((m) => ({
    class_id: m.class_id,
    status: m.status,
    classes: m.classes && m.classes.length > 0 ? m.classes[0] : null,
  }));

  // Si l'élève a déjà rejoint au moins 1 classe et arrive ici sans contexte,
  // on ne force pas — on lui montre où il en est + lien continuer.

  // Fetch profs pour afficher leur nom
  const teacherIds = Array.from(
    new Set(
      memberships
        .map((m) => m.classes?.teacher_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  let teacherById = new Map<string, string>();
  if (teacherIds.length > 0) {
    const profilesRes = await admin
      .from("user_profiles")
      .select("id, first_name, last_name")
      .in("id", teacherIds);
    if (profilesRes.error) throw profilesRes.error;
    teacherById = new Map(
      ((profilesRes.data as { id: string; first_name: string | null; last_name: string | null }[] | null) ?? [])
        .map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Prof"]),
    );
  }

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-12 sm:px-6"
      lang="fr-BE"
    >
      <header className="mb-8 text-center">
        <div
          aria-hidden="true"
          className="
            mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl
            bg-indigo-600 text-white
          "
        >
          <Sparkles size={24} strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Rejoins ta classe
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Entre le code donné par ton professeur. C&apos;est ce qui permet à
          Maïa de te montrer les bons devoirs et les bons cours.
        </p>
      </header>

      {memberships.length > 0 ? (
        <section
          aria-labelledby="already-title"
          className="
            mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5
            dark:border-emerald-900 dark:bg-emerald-950/30
          "
        >
          <h2
            id="already-title"
            className="text-sm font-semibold text-emerald-900 dark:text-emerald-200"
          >
            Tes classes actuelles
          </h2>
          <ul role="list" className="mt-2 space-y-1.5">
            {memberships.map((m) => (
              <li
                key={m.class_id}
                className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300"
              >
                <CheckCircle2
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span>
                  <strong>{m.classes?.name ?? "Classe"}</strong>
                  {m.classes?.teacher_id ? (
                    <>
                      {" "}— prof {teacherById.get(m.classes.teacher_id) ?? "inconnu"}
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="join-form-title"
        className="
          rounded-2xl border border-slate-200 bg-white p-6 shadow-sm
          dark:border-slate-800 dark:bg-slate-900
        "
      >
        <h2
          id="join-form-title"
          className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          {memberships.length > 0
            ? "Rejoindre une autre classe"
            : "Code de classe"}
        </h2>
        <JoinClassForm />
      </section>

      <nav aria-label="Continuer" className="mt-6 text-center">
        <Link
          href="/accueil"
          className="
            inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm
            font-medium text-slate-600 transition
            hover:text-slate-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            dark:text-slate-400 dark:hover:text-slate-200
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          {memberships.length > 0 ? "Continuer vers mon accueil" : "Plus tard"}
          <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
        </Link>
        {memberships.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
            Tu pourras rejoindre une classe plus tard depuis ton accueil.
          </p>
        ) : null}
      </nav>
    </main>
  );
}
