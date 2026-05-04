import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase-server";
import Header from "@/components/Header";
import DailyStudyCard from "@/components/DailyStudyCard";

export const dynamic = "force-dynamic";

function NavCard({
  href,
  emoji,
  label,
  desc,
  tag,
  color = "amber",
}: {
  href: string;
  emoji: string;
  label: string;
  desc: string;
  tag?: string;
  color?: "amber" | "purple" | "blue" | "green";
}) {
  const borders = {
    amber: "border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5",
    purple: "border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/5",
    blue: "border-blue-500/30 hover:border-blue-500/60 hover:bg-blue-500/5",
    green: "border-green-500/30 hover:border-green-500/60 hover:bg-green-500/5",
  };
  const tags = {
    amber: "bg-amber-500/20 text-amber-300",
    purple: "bg-purple-500/20 text-purple-300",
    blue: "bg-blue-500/20 text-blue-300",
    green: "bg-green-500/20 text-green-300",
  };
  const icons = {
    amber: "bg-amber-500/10",
    purple: "bg-purple-500/10",
    blue: "bg-blue-500/10",
    green: "bg-green-500/10",
  };

  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-2xl border bg-gray-900 p-4 transition ${borders[color]}`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${icons[color]}`}
      >
        {emoji}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-black text-white">{label}</p>
          {tag && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${tags[color]}`}
            >
              {tag}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
      </div>
      <span className="text-gray-600 transition group-hover:text-gray-400">
        →
      </span>
    </Link>
  );
}

export default async function SchoolioHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <Header />

      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-amber-400">
            🎓 Schoolio
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Ta plateforme
            <br />
            <span className="text-amber-400">d&apos;apprentissage adaptatif</span>
          </h1>
          <p className="mt-3 text-base text-gray-500">
            Étudie à ton rythme · Révision espacée · IA personnalisée
          </p>

          {!user && (
            <Link
              href="/auth/callback"
              className="mt-6 inline-block rounded-2xl bg-amber-500 px-8 py-3 font-black text-gray-950 transition hover:bg-amber-400"
            >
              Commencer gratuitement →
            </Link>
          )}
        </div>

        {/* Daily study card */}
        {user && (
          <div className="mb-6">
            <Suspense fallback={null}>
              <DailyStudyCard userId={user.id} />
            </Suspense>
          </div>
        )}

        {/* Navigation cards */}
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
            Modules
          </p>

          <NavCard
            href="/study"
            emoji="📖"
            label="Étudier"
            desc="10 matières · Génération IA · Sessions personnalisées"
            tag="IA"
            color="amber"
          />

          <NavCard
            href="/train"
            emoji="🎯"
            label="Entraînement"
            desc="Quiz adaptatif · Concepts · Maîtrise progressive"
            color="purple"
          />

          <NavCard
            href="/school"
            emoji="🏫"
            label="Espace professeur"
            desc="Créer des quiz · Importer PDF · Gérer les classes"
            color="blue"
          />

          <NavCard
            href="/profile"
            emoji="📊"
            label="Mes progrès"
            desc="Statistiques · Niveaux de maîtrise · Historique"
            color="green"
          />
        </div>

        {user && (
          <div className="mt-6">
            <Link
              href="/study/stats"
              className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-500 transition hover:border-gray-700 hover:text-gray-300"
            >
              <span>Voir mes statistiques d&apos;apprentissage</span>
              <span>→</span>
            </Link>
          </div>
        )}

        <p className="mt-12 text-center text-xs text-gray-700">
          Propulsé par Claude AI · Supabase · Next.js
        </p>
      </div>
    </main>
  );
}
