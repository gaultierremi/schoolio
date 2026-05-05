"use client";

import { motion, useReducedMotion } from "framer-motion";
import LandingCTA from "@/components/LandingCTA";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fadeUpProps(delay = 0, reduced: boolean | null) {
  if (reduced) return {};
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-50px" },
    transition: { duration: 0.5, ease: "easeOut", delay },
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AudienceCard({
  emoji,
  title,
  description,
  featured = false,
  delay = 0,
}: {
  emoji: string;
  title: string;
  description: string;
  featured?: boolean;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`rounded-2xl border bg-gray-900 p-6 ${
        featured ? "border-purple-500/40" : "border-gray-800"
      }`}
      {...fadeUpProps(delay, reduced)}
    >
      <span className="text-4xl">{emoji}</span>
      <p className="mt-4 font-black text-white">{title}</p>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
    </motion.div>
  );
}

function StepCard({
  number,
  title,
  description,
  delay = 0,
}: {
  number: string;
  title: string;
  description: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div {...fadeUpProps(delay, reduced)}>
      <p className="text-6xl font-black text-purple-500/30">{number}</p>
      <p className="mt-4 font-black text-white">{title}</p>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const reduced = useReducedMotion();

  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* §1 — HERO */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-gray-950 via-purple-900/20 to-gray-950 px-4 py-20 text-center">

        {/* Zone C — floating blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="animate-blob absolute -left-32 -top-32 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl"
            style={{ animationDelay: "0s" }}
          />
          <div
            className="animate-blob absolute -right-32 top-1/2 h-80 w-80 rounded-full bg-pink-600/15 blur-3xl"
            style={{ animationDelay: "6s" }}
          />
          <div
            className="animate-blob absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-indigo-600/15 blur-3xl"
            style={{ animationDelay: "12s" }}
          />
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-purple-300">
          ✨ Beta · Construit en direct
        </span>

        <h1 className="mt-8 text-5xl font-black tracking-tight text-white md:text-7xl">
          La plateforme qui{" "}
          {/* Zone A — animated gradient */}
          <span className="animate-gradient-shift bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
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
        <motion.div {...fadeUpProps(0, reduced)}>
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
            Schoolio s&apos;adapte à toi
          </p>
          <h2 className="mt-3 text-3xl font-black text-white md:text-4xl">
            Pour les curieux, les enseignants,
            <br className="hidden md:block" /> et ceux qui veulent grandir.
          </h2>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <AudienceCard
            emoji="🎒"
            title="Élèves & étudiants"
            description="Ne révise plus au hasard. Schoolio identifie tes lacunes et te propose les questions qui te feront vraiment progresser. Concept par concept."
            delay={0}
          />
          <AudienceCard
            emoji="🎓"
            title="Enseignants"
            description="Uploade un PDF de cours. Schoolio génère 25 questions calibrées en 60 secondes. Suis la progression de chaque élève sans corriger une seule copie."
            featured
            delay={0.1}
          />
          <AudienceCard
            emoji="🚀"
            title="Autodidactes"
            description="Apprends ce que tu veux, à ton rythme. Permis, droit, médecine, langues — Schoolio s'adapte à n'importe quelle matière."
            delay={0.2}
          />
        </div>
      </section>

      {/* §3 — COMMENT ÇA MARCHE */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        <motion.h2
          className="text-3xl font-black text-white md:text-4xl"
          {...fadeUpProps(0, reduced)}
        >
          Trois étapes pour progresser.
        </motion.h2>

        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
          <StepCard
            number="01"
            title="Choisis ton terrain"
            description="Upload un cours, génère depuis un sujet, ou pioche dans la bibliothèque communautaire."
            delay={0}
          />
          <StepCard
            number="02"
            title="L'IA personnalise"
            description="Schoolio comprend tes points forts et tes lacunes. Chaque question que tu vois est choisie pour toi."
            delay={0.1}
          />
          <StepCard
            number="03"
            title="Mesure tes progrès"
            description="Visualise ta maîtrise par concept. Reviens demain pour les bons exercices au bon moment."
            delay={0.2}
          />
        </div>
      </section>

      {/* §4 — MANIFESTE */}
      <section className="border-y border-gray-900 py-20">
        <motion.div
          className="mx-auto max-w-3xl px-4 text-center"
          {...fadeUpProps(0, reduced)}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
            Notre conviction
          </p>
          <h2 className="mt-4 text-2xl font-black text-white md:text-3xl">
            L&apos;IA ne devrait pas te remplacer.
            <br /> Elle devrait te révéler.
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
        </motion.div>
      </section>

      {/* §5 — CTA FINAL */}
      <motion.section
        className="mx-auto max-w-6xl px-4 py-20 text-center"
        {...fadeUpProps(0, reduced)}
      >
        <h2 className="text-3xl font-black text-white md:text-4xl">
          Prêt à révéler ton potentiel ?
        </h2>
        <p className="mt-4 text-base text-gray-500">
          Connexion en 5 secondes avec Google. Aucune carte requise.
        </p>
        <LandingCTA className="mt-8" />
      </motion.section>

      {/* §6 — FOOTER */}
      <footer className="border-t border-gray-900 py-8 text-center">
        <p className="text-sm text-gray-600">
          © 2026 Schoolio · Beta active · Construit par Gaultier en Belgique 🇧🇪
        </p>
      </footer>

    </main>
  );
}
