import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase-server";
import Header from "@/components/Header";
import DailyStudyCard from "@/components/DailyStudyCard";
import LandingCTA from "@/components/LandingCTA";

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

// ── Sub-components (landing non-loggé) ───────────────────────────────────────

function AudienceCard({
  emoji,
  title,
  description,
  featured = false,
}: {
  emoji: string;
  title: string;
  description: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-gray-900 p-6 ${
        featured ? "border-purple-500/40" : "border-gray-800"
      }`}
    >
      <span className="text-4xl">{emoji}</span>
      <p className="mt-4 font-black text-white">{title}</p>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-6xl font-black text-purple-500/30">{number}</p>
      <p className="mt-4 font-black text-white">{title}</p>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SchoolioHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── LANDING (non-loggé) ───────────────────────────────────────────────────

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">

        {/* §1 — HERO */}
        <section className="flex min-h-[80vh] flex-col items-center justify-center bg-gradient-to-b from-gray-950 via-purple-900/20 to-gray-950 px-4 py-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-purple-300">
            ✨ Beta · Construit en direct
          </span>

          <h1 className="mt-8 text-5xl font-black tracking-tight text-white md:text-7xl">
            La plateforme qui{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              révèle
            </span>{" "}
            ton potentiel.
          </h1>

          <p className="mt-6 text-xl text-gray-400">
            Apprends avec l&apos;IA. Pas à sa place.
          </p>

          <p className="mx-auto mt-4 max-w-xl text-base text-gray-500">
            Schoolio combine intelligence artificielle et pédagogie adaptative
            pour transformer chaque session d&apos;étude en progrès mesurable.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <LandingCTA />
            <a
              href="#how"
              className="rounded-2xl border border-gray-700 px-8 py-4 font-black text-gray-300 transition hover:border-gray-500 hover:text-white"
            >
              Voir comment ça marche ↓
            </a>
          </div>
        </section>

        {/* §2 — POUR QUI */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
            Schoolio s&apos;adapte à toi
          </p>
          <h2 className="mt-3 text-3xl font-black text-white md:text-4xl">
            Pour les curieux, les enseignants,<br className="hidden md:block" /> et ceux qui veulent grandir.
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            <AudienceCard
              emoji="🎒"
              title="Élèves & étudiants"
              description="Ne révise plus au hasard. Schoolio identifie tes lacunes et te propose les questions qui te feront vraiment progresser. Concept par concept."
            />
            <AudienceCard
              emoji="🎓"
              title="Enseignants"
              description="Uploade un PDF de cours. Schoolio génère 25 questions calibrées en 60 secondes. Suis la progression de chaque élève sans corriger une seule copie."
              featured
            />
            <AudienceCard
              emoji="🚀"
              title="Autodidactes"
              description="Apprends ce que tu veux, à ton rythme. Permis, droit, médecine, langues — Schoolio s'adapte à n'importe quelle matière."
            />
          </div>
        </section>

        {/* §3 — COMMENT ÇA MARCHE */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-black text-white md:text-4xl">
            Trois étapes pour progresser.
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
            <StepCard
              number="01"
              title="Choisis ton terrain"
              description="Upload un cours, génère depuis un sujet, ou pioche dans la bibliothèque communautaire."
            />
            <StepCard
              number="02"
              title="L'IA personnalise"
              description="Schoolio comprend tes points forts et tes lacunes. Chaque question que tu vois est choisie pour toi."
            />
            <StepCard
              number="03"
              title="Mesure tes progrès"
              description="Visualise ta maîtrise par concept. Reviens demain pour les bons exercices au bon moment."
            />
          </div>
        </section>

        {/* §4 — MANIFESTE */}
        <section className="border-y border-gray-900 py-20">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
              Notre conviction
            </p>
            <h2 className="mt-4 text-2xl font-black text-white md:text-3xl">
              L&apos;IA ne devrait pas te remplacer.<br /> Elle devrait te révéler.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-gray-400">
              Beaucoup utilisent aujourd&apos;hui l&apos;intelligence artificielle pour éviter
              d&apos;apprendre. Schoolio fait l&apos;inverse. Nous croyons que l&apos;IA, bien
              utilisée, est l&apos;outil le plus puissant jamais inventé pour révéler le
              potentiel de chacun. Pas pour penser à ta place. Pour te muscler le cerveau.
            </p>
            <p className="mt-6 text-sm italic text-gray-600">
              — L&apos;équipe Schoolio
            </p>
          </div>
        </section>

        {/* §5 — CTA FINAL */}
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-3xl font-black text-white md:text-4xl">
            Prêt à révéler ton potentiel ?
          </h2>
          <p className="mt-4 text-base text-gray-500">
            Connexion en 5 secondes avec Google. Aucune carte requise.
          </p>
          <LandingCTA className="mt-8" />
        </section>

        {/* §6 — FOOTER */}
        <footer className="border-t border-gray-900 py-8 text-center">
          <p className="text-sm text-gray-600">
            © 2026 Schoolio · Beta active · Construit par Gaultier en Belgique 🇧🇪
          </p>
        </footer>

      </main>
    );
  }

  // ── DASHBOARD (loggé) — inchangé ─────────────────────────────────────────

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <Header />

      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-purple-400">
            🎓 Schoolio
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Ta plateforme
            <br />
            <span className="text-purple-400">d&apos;apprentissage adaptatif</span>
          </h1>
          <p className="mt-3 text-base text-gray-500">
            Étudie à ton rythme · Révision espacée · IA personnalisée
          </p>
        </div>

        {/* Daily study card */}
        <div className="mb-6">
          <Suspense fallback={null}>
            <DailyStudyCard userId={user.id} />
          </Suspense>
        </div>

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
            color="purple"
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

        <div className="mt-6">
          <Link
            href="/study/stats"
            className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-500 transition hover:border-gray-700 hover:text-gray-300"
          >
            <span>Voir mes statistiques d&apos;apprentissage</span>
            <span>→</span>
          </Link>
        </div>

        <p className="mt-12 text-center text-xs text-gray-700">
          Propulsé par Claude AI · Supabase · Next.js
        </p>
      </div>
    </main>
  );
}
