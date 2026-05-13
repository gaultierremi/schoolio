import Link from "next/link";
import ProfileEditor from "@/components/ProfileEditor";
import { getOrCreateProfile, getUserStats, unlockEligibleSkins } from "@/lib/profile";
import { createClient } from "@/lib/supabase-server";

export default async function ProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-black text-white">
          Connecte-toi pour personnaliser ton profil
        </h1>
        <p className="mt-3 text-gray-400">
          Ton avatar, tes skins et ta progression sont liés à ton compte.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-2xl bg-purple-500 px-6 py-3 font-black text-white transition hover:bg-purple-600"
        >
          Retour à l&apos;accueil
        </Link>
      </main>
    );
  }

  const role = (user.user_metadata as Record<string, unknown>)?.role as string | undefined;
  const isStudent = role === "student";

  const defaultName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Historien mystère";

  await getOrCreateProfile(supabase, user.id, defaultName);
  await unlockEligibleSkins(supabase, user.id);

  const profile = await getUserStats(supabase, user.id);

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-black text-white">
          Profil introuvable
        </h1>
        <p className="mt-3 text-gray-400">
          Impossible de charger ton profil pour le moment.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-6">
        <Link
          href="/"
          className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-300 transition hover:text-white"
        >
          ← Accueil
        </Link>

        {isStudent && (
          <Link
            href="/student?welcome=1"
            className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-300 transition hover:text-white"
          >
            Revoir le tutoriel
          </Link>
        )}
      </div>

      <ProfileEditor initialProfile={profile} />
    </main>
  );
}
