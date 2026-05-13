import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import Header from "@/components/Header";
import LandingPage from "@/components/LandingPage";

export const dynamic = "force-dynamic";

// ── Sub-components (loggé) ────────────────────────────────────────────────────

function NavCard({
  href,
  emoji,
  label,
  desc,
  tag,
  color = "purple",
}: {
  href: string;
  emoji: string;
  label: string;
  desc: string;
  tag?: string;
  color?: "purple" | "blue" | "green";
}) {
  const borders = {
    amber: "border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/5",
    purple: "border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/5",
    blue: "border-blue-500/30 hover:border-blue-500/60 hover:bg-blue-500/5",
    green: "border-green-500/30 hover:border-green-500/60 hover:bg-green-500/5",
  };
  const tags = {
    amber: "bg-purple-500/20 text-purple-300",
    purple: "bg-purple-500/20 text-purple-300",
    blue: "bg-blue-500/20 text-blue-300",
    green: "bg-green-500/20 text-green-300",
  };
  const icons = {
    amber: "bg-purple-500/10",
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SchoolioHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

  // ── DASHBOARD (loggé) — inchangé ─────────────────────────────────────────

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <Header />

      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-purple-400">
            🎓 Maïa
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Apprentissage augmenté
            <br />
            <span className="text-purple-400">le prof reste l&apos;autorité pédagogique</span>
          </h1>
          <p className="mt-3 text-base text-gray-500">
            Renforcement adaptive · Banks Socratiques · 0 IA runtime face à l&apos;élève
          </p>
        </div>

        {/* Navigation cards */}
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
            Modules
          </p>

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
            desc="Statistiques · Historique"
            color="green"
          />
        </div>

        <p className="mt-12 text-center text-xs text-gray-700">
          Propulsé par Claude AI · Supabase · Next.js
        </p>
      </div>
    </main>
  );
}
