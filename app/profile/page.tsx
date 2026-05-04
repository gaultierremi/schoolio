import Link from "next/link";
import ProfileEditor from "@/components/ProfileEditor";
import MasteryDashboard from "@/components/MasteryDashboard";
import { getOrCreateProfile, getUserStats, unlockEligibleSkins } from "@/lib/profile";
import { createClient } from "@/lib/supabase-server";
import { getUserMastery } from "@/lib/concepts";
import type { ConceptMastery } from "@/lib/concepts";

export default async function ProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-black text-slate-900">
          Connecte-toi pour personnaliser ton profil
        </h1>
        <p className="mt-3 text-slate-600">
          Ton avatar, tes skins et ta progression sont liés à ton compte.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-2xl bg-amber-500 px-6 py-3 font-black text-white transition hover:bg-amber-600"
        >
          Retour à l’accueil
        </Link>
      </main>
    );
  }

  const defaultName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Historien mystère";

  await getOrCreateProfile(supabase, user.id, defaultName);
  await unlockEligibleSkins(supabase, user.id);

  const profile = await getUserStats(supabase, user.id);

  let mastery: ConceptMastery[] = [];
  try {
    mastery = await getUserMastery(user.id);
  } catch {
    // Table not yet created — degrade gracefully
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-black text-slate-900">
          Profil introuvable
        </h1>
        <p className="mt-3 text-slate-600">
          Impossible de charger ton profil pour le moment.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <Link
          href="/"
          className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
        >
          ← Accueil
        </Link>

        <Link
          href="/scoreboard"
          className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
        >
          Classements
        </Link>
      </div>

      <ProfileEditor initialProfile={profile} />

      <div className="mx-auto max-w-2xl px-4 pb-12">
        <h2 className="mb-6 text-2xl font-black text-slate-800">
          📊 Mes progrès
        </h2>
        <MasteryDashboard mastery={mastery} />
      </div>
    </main>
  );
}