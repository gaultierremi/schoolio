import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  HandHeart,
  Mail,
  Shield,
  Users,
} from "lucide-react";
import MaiaMarketingHeader from "@/components/marketing/MaiaMarketingHeader";
import MaiaFooter from "@/components/marketing/MaiaFooter";

/**
 * Sprint 6 PR S6-3 — Page /pilotes dédiée (capture 3 écoles pré-MVP).
 *
 * Cohérent avec mémoires :
 * - `project_landing_pilots_3_schools` : 3 écoles max, 1 an gratuit,
 *   accompagnement, **pas** de co-construction, contact pilotes@maia.app
 * - `feedback_no_pricing_public` : pas de mention €36/an, ton manifeste,
 *   CTA = pilotes accompagnés
 * - `feedback_landing_tone_adult_kind` : adulte bienveillant
 *
 * Approche minimale : copy détaillée + CTA mailto. Pas d'API ni de DB pour
 * tracker les candidatures (anti-overengineering MVP — 3 écoles max =
 * gestion manuelle dans la boîte mail des fondateurs).
 *
 * SEO : page statique (pas de force-dynamic), bénéficie du SSG Next 14.
 */

export const metadata = {
  title: "Programme pilote · Maïa",
  description:
    "Maïa cherche 3 écoles pilotes pour la rentrée 2026. Un an d'accompagnement gratuit, sans engagement.",
};

const PILOTE_EMAIL = "pilotes@maia.app";

const MAILTO_SUBJECT = "Candidature pilote Maïa 2026";
const MAILTO_BODY = `Bonjour l'équipe Maïa,

Notre école souhaite candidater au programme pilote 2026.

École :
Adresse :
Niveau(x) concerné(s) :
Contact principal (nom + rôle) :
Téléphone :

Pourquoi notre école :


Merci d'avance pour votre retour.`;

function mailtoHref() {
  const params = new URLSearchParams({
    subject: MAILTO_SUBJECT,
    body: MAILTO_BODY,
  });
  return `mailto:${PILOTE_EMAIL}?${params.toString()}`;
}

export default function PilotesPage() {
  return (
    <>
      <MaiaMarketingHeader />
      <main className="bg-white dark:bg-slate-950" lang="fr-BE">
        {/* ── Hero ── */}
        <section className="px-6 pb-12 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow">Programme pilote · rentrée 2026</p>
            <h1 className="serif mt-4 text-4xl font-semibold ink sm:text-5xl">
              Trois écoles. Une année gratuite. Un accompagnement réel.
            </h1>
            <p className="mt-6 text-lg ink2 leading-relaxed">
              Maïa entre en phase pilote pour la rentrée 2026. Nous cherchons
              trois écoles secondaires en Belgique francophone qui veulent
              expérimenter un outil qui réconcilie l&apos;élève avec la maîtrise
              progressive du programme — et le prof avec une vraie vue sur ce
              qui bloque.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href={mailtoHref()}
                className="
                  inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5
                  text-base font-semibold text-white transition
                  hover:bg-indigo-700
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  focus-visible:ring-offset-2 focus-visible:ring-offset-white
                  dark:focus-visible:ring-offset-slate-950
                  motion-reduce:transition-none
                "
              >
                <Mail size={16} strokeWidth={2} aria-hidden="true" />
                Postuler par email
                <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </a>
              <a
                href="#programme"
                className="
                  inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white
                  px-6 py-3.5 text-base font-medium text-slate-700 transition
                  hover:bg-slate-50
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  focus-visible:ring-offset-2 focus-visible:ring-offset-white
                  dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200
                  dark:hover:bg-slate-800
                  dark:focus-visible:ring-offset-slate-950
                  motion-reduce:transition-none
                "
              >
                Voir le programme en détail
              </a>
            </div>
            <p className="mt-4 text-sm ink3">
              Ou écrivez-nous directement :{" "}
              <a
                href={`mailto:${PILOTE_EMAIL}`}
                className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
              >
                {PILOTE_EMAIL}
              </a>
            </p>
          </div>
        </section>

        {/* ── KPI hero ── */}
        <section
          aria-labelledby="kpi-title"
          className="border-y border-slate-200 bg-slate-50 py-12 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 id="kpi-title" className="sr-only">
            Indicateurs du programme
          </h2>
          <div className="mx-auto max-w-3xl px-6">
            <div className="grid gap-8 sm:grid-cols-3">
              <KpiBlock value="3" unit="écoles max" caption="Sélection serrée, accompagnement réel" />
              <KpiBlock value="1 an" unit="gratuit" caption="Pas d'engagement, pas de carte de crédit" />
              <KpiBlock value="2h" unit="par semaine" caption="Support direct par les fondateurs" />
            </div>
          </div>
        </section>

        {/* ── Programme détaillé ── */}
        <section id="programme" className="px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow">Ce qu&apos;on vous propose</p>
            <h2 className="serif mt-4 text-3xl font-semibold ink">
              Un produit fini, pas un prototype.
            </h2>
            <p className="mt-4 text-lg ink2 leading-relaxed">
              Maïa est un outil opérationnel, pas un projet de recherche. Nous
              ne demandons pas à vos profs de co-construire avec nous ni de
              tester des features instables. Vous l&apos;utilisez tel qu&apos;il
              est, vous nous dites si ça marche dans votre réalité, et on
              ajuste ce qui doit l&apos;être en arrière-plan.
            </p>

            <ul role="list" className="mt-10 space-y-6">
              <PromiseItem
                icon={<HandHeart size={20} strokeWidth={1.75} aria-hidden="true" />}
                title="Accompagnement direct, pas via un manuel"
              >
                Deux heures par semaine en visio avec les fondateurs pour vous
                aider à intégrer Maïa dans 1 à 3 classes. Un point hebdo
                concret : ce qui marche, ce qui bloque, ce qu&apos;on ajuste
                pour la semaine suivante.
              </PromiseItem>
              <PromiseItem
                icon={<Users size={20} strokeWidth={1.75} aria-hidden="true" />}
                title="Vos profs gardent le contrôle"
              >
                Maïa génère du contenu pédagogique depuis vos syllabi (PDF,
                FW-B, etc.). Vos profs valident question par question avant que
                ça aille aux élèves. Pas de boîte noire IA balancée aux élèves
                sans curation prof.
              </PromiseItem>
              <PromiseItem
                icon={<Shield size={20} strokeWidth={1.75} aria-hidden="true" />}
                title="RGPD strict, données chez nous"
              >
                Hébergement européen (Vercel + Supabase eu-west-1). Pas de
                revente, pas de pub, pas de partage. Données des élèves
                mineurs : consentement parental obligatoire avant toute
                activation. Audit log immutable.
              </PromiseItem>
              <PromiseItem
                icon={<Clock size={20} strokeWidth={1.75} aria-hidden="true" />}
                title="Un an pour mesurer"
                noBorder
              >
                Pas de tarif après l&apos;année gratuite tant que vous
                n&apos;avez pas vu si ça apporte vraiment quelque chose à vos
                élèves. Si oui, on parle abonnement à ce moment-là. Si non, on
                vous quitte sans rancune.
              </PromiseItem>
            </ul>
          </div>
        </section>

        {/* ── Critères de sélection ── */}
        <section className="border-y border-slate-200 bg-slate-50 px-6 py-16 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow">Critères de sélection</p>
            <h2 className="serif mt-4 text-3xl font-semibold ink">
              Trois écoles, choisies pour leur diversité.
            </h2>
            <p className="mt-4 text-lg ink2 leading-relaxed">
              On cherche des contextes différents pour s&apos;assurer que Maïa
              tient la route partout — pas seulement dans les écoles déjà
              suréquipées.
            </p>
            <ul role="list" className="mt-8 space-y-3 text-base ink2">
              <CriterionItem>
                Au moins 1 à 3 classes de secondaire prêtes à essayer (un cours,
                un trimestre, pour commencer).
              </CriterionItem>
              <CriterionItem>
                Un référent (direction ou prof) joignable une fois par semaine.
              </CriterionItem>
              <CriterionItem>
                Une direction qui valide officiellement l&apos;expérimentation
                (RGPD oblige).
              </CriterionItem>
              <CriterionItem>
                Pas besoin d&apos;infrastructure spéciale : Maïa fonctionne dans
                un navigateur, sur mobile et sur PC.
              </CriterionItem>
            </ul>
          </div>
        </section>

        {/* ── CTA final ── */}
        <section className="px-6 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="serif text-3xl font-semibold ink">
              Votre école pourrait être l&apos;une des trois.
            </h2>
            <p className="mt-4 text-lg ink2">
              Écrivez-nous quelques lignes sur votre contexte. On revient vers
              vous sous une semaine.
            </p>
            <a
              href={mailtoHref()}
              className="
                mt-8 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5
                text-base font-semibold text-white transition
                hover:bg-indigo-700
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                focus-visible:ring-offset-2 focus-visible:ring-offset-white
                dark:focus-visible:ring-offset-slate-950
                motion-reduce:transition-none
              "
            >
              <Mail size={16} strokeWidth={2} aria-hidden="true" />
              Candidater par email
            </a>
            <p className="mt-6 text-sm ink3">
              Pas prêt à candidater ? Lisez d&apos;abord{" "}
              <Link
                href="/"
                className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
              >
                la page d&apos;accueil
              </Link>
              {" "}qui explique pourquoi Maïa existe.
            </p>
          </div>
        </section>
      </main>
      <MaiaFooter />
    </>
  );
}

function KpiBlock({
  value,
  unit,
  caption,
}: {
  value: string;
  unit: string;
  caption: string;
}) {
  return (
    <div className="text-center">
      <p className="serif text-5xl font-semibold accent-text">{value}</p>
      <p className="mt-1 text-sm font-medium ink">{unit}</p>
      <p className="mt-2 text-xs ink3">{caption}</p>
    </div>
  );
}

function PromiseItem({
  icon,
  title,
  children,
  noBorder,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <li
      className={`
        flex items-start gap-4 ${noBorder ? "" : "border-b border-slate-200 pb-6 dark:border-slate-800"}
      `}
    >
      <div
        aria-hidden="true"
        className="
          flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
          bg-indigo-100 text-indigo-700
          dark:bg-indigo-950/40 dark:text-indigo-300
        "
      >
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold ink">{title}</h3>
        <p className="mt-1 ink2 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

function CriterionItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <CheckCircle2
        size={20}
        strokeWidth={1.75}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
      />
      <span>{children}</span>
    </li>
  );
}
