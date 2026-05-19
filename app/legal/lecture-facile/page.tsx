import Link from "next/link";
import { FileText, Heart, Lock, Mail, Shield, ShieldCheck, UserCheck } from "lucide-react";

/**
 * Sprint 6 PR S6-9 — Version "lecture facile" des textes légaux RGPD.
 *
 * Pour parents, élèves mineurs, et toute personne qui n'a pas envie de
 * lire 30 pages de CGU. Reprend l'essentiel des 4 textes en langage
 * simple, structure claire, et avec liens vers les textes officiels
 * pour le détail.
 *
 * Mémoire `backlog_pre_pilote` : "Lecture facile RGPD (textes simplifiés
 * parents/élèves)".
 *
 * Approche : page statique inline (pas de markdown source). Si on doit
 * un jour traduire/changer, on édite ici directement. Pas de surcharge
 * d'architecture pour cette page unique.
 */
export const metadata = {
  title: "Maïa expliqué simplement · Maïa",
  description:
    "Comment Maïa utilise tes données, en langage simple. Pour les élèves, les parents, et tous ceux qui veulent comprendre rapidement.",
};

export default function LectureFacilePage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12" lang="fr-BE">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
          Maïa expliqué simplement
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Tes données, expliquées sans jargon.
        </h1>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
          Cette page résume les choses importantes sur la façon dont Maïa
          fonctionne avec tes informations. Les textes complets restent
          disponibles plus bas.
        </p>
      </header>

      <Section
        icon={<UserCheck size={20} strokeWidth={1.75} aria-hidden="true" />}
        title="Qui peut utiliser Maïa ?"
      >
        <p>
          Maïa est utilisé par des écoles secondaires. Si tu as moins de 16 ans,
          un parent ou tuteur doit donner son accord avant que tu puisses
          t&apos;inscrire. C&apos;est la loi.
        </p>
      </Section>

      <Section
        icon={<FileText size={20} strokeWidth={1.75} aria-hidden="true" />}
        title="Quelles données on a sur toi ?"
      >
        <ul className="space-y-2">
          <li>
            <strong>Ton prénom et nom</strong> (ou un pseudo si tu préfères).
          </li>
          <li>
            <strong>Ton email scolaire</strong>, pour te connecter.
          </li>
          <li>
            <strong>Tes réponses aux exercices</strong>, pour qu&apos;on sache
            ce que tu maîtrises et ce qui te bloque.
          </li>
          <li>
            <strong>Ta classe et ton école</strong>, pour te montrer les bons
            devoirs.
          </li>
        </ul>
        <p className="mt-3 text-sm italic">
          On ne demande pas ton adresse, ton numéro de téléphone, ni tes
          réseaux sociaux.
        </p>
      </Section>

      <Section
        icon={<Lock size={20} strokeWidth={1.75} aria-hidden="true" />}
        title="Où sont stockées tes données ?"
      >
        <p>
          Tout est hébergé en Europe (Belgique et Pays-Bas). On ne partage
          jamais tes données avec des sociétés en-dehors de l&apos;Europe.
          On ne vend rien à personne.
        </p>
      </Section>

      <Section
        icon={<Heart size={20} strokeWidth={1.75} aria-hidden="true" />}
        title="Qui peut voir tes réponses ?"
      >
        <ul className="space-y-2">
          <li>
            <strong>Toi</strong>, sur ton accueil et tes bilans.
          </li>
          <li>
            <strong>Ton prof</strong>, pour savoir où la classe en est et
            t&apos;aider si tu bloques.
          </li>
          <li>
            <strong>Pas tes camarades</strong>. Ils ne voient pas tes scores ni
            tes erreurs.
          </li>
          <li>
            <strong>Pas d&apos;autres écoles</strong>. Chaque école a ses propres
            données, séparées.
          </li>
        </ul>
      </Section>

      <Section
        icon={<ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />}
        title="Tes droits"
      >
        <p>Tu peux à tout moment :</p>
        <ul className="space-y-2">
          <li>
            <strong>Demander une copie</strong> de toutes tes données (export
            depuis ton profil).
          </li>
          <li>
            <strong>Demander la suppression</strong> de ton compte (depuis ton
            profil).
          </li>
          <li>
            <strong>Modifier</strong> ton prénom, nom, pseudo.
          </li>
          <li>
            <strong>Refuser une utilisation spécifique</strong> de tes données
            (depuis tes paramètres de confidentialité).
          </li>
        </ul>
      </Section>

      <Section
        icon={<Shield size={20} strokeWidth={1.75} aria-hidden="true" />}
        title="Ce qu&apos;on ne fait pas avec Maïa"
      >
        <ul className="space-y-2">
          <li>On ne vend jamais tes données.</li>
          <li>On ne te montre pas de publicité.</li>
          <li>
            On n&apos;utilise pas tes données pour entraîner une IA externe.
          </li>
          <li>
            On ne contacte pas tes parents sans raison liée à
            l&apos;utilisation du service.
          </li>
        </ul>
      </Section>

      <Section
        icon={<Mail size={20} strokeWidth={1.75} aria-hidden="true" />}
        title="Une question ?"
      >
        <p>
          Tu peux nous écrire à{" "}
          <a
            href="mailto:rgpd@maia.app"
            className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
          >
            rgpd@maia.app
          </a>
          . On répond sous 7 jours ouvrés maximum (souvent plus vite).
        </p>
        <p className="mt-3">
          Si tu n&apos;es pas satisfait·e, tu peux aussi contacter
          l&apos;Autorité de protection des données (APD) en Belgique.
        </p>
      </Section>

      <aside className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Tu veux lire les textes complets ?
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Ils sont écrits en langage juridique, plus long mais plus précis.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <Link
              href="/legal/cgu"
              className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
            >
              Conditions générales d&apos;utilisation
            </Link>
          </li>
          <li>
            <Link
              href="/legal/confidentialite"
              className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
            >
              Politique de confidentialité (RGPD complet)
            </Link>
          </li>
          <li>
            <Link
              href="/legal/cookies"
              className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
            >
              Politique cookies
            </Link>
          </li>
          <li>
            <Link
              href="/legal/mentions-legales"
              className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
            >
              Mentions légales
            </Link>
          </li>
        </ul>
      </aside>
    </article>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
        <span
          aria-hidden="true"
          className="
            flex h-9 w-9 items-center justify-center rounded-xl
            bg-indigo-100 text-indigo-700
            dark:bg-indigo-950/40 dark:text-indigo-300
          "
        >
          {icon}
        </span>
        {title}
      </h2>
      <div className="space-y-3 text-base text-slate-700 dark:text-slate-300 [&_ul]:list-disc [&_ul]:pl-6 [&_strong]:font-semibold [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100">
        {children}
      </div>
    </section>
  );
}
