import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Lightbulb,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { requireStudentPage } from "@/lib/auth/role";
import { masteryCellClass, masteryLabel, masteryLevel } from "@/lib/heatmap-mastery";
import {
  SECTION_KINDS,
  type SectionKind,
} from "@/lib/curation/validation";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sprint 6 PR S6-5 — Drill-down concept élève depuis heatmap.
 *
 * Page server qui affiche :
 * - Nom + description du concept
 * - Mastery % actuel de l'élève (calculé depuis ses réponses)
 * - Théorie curée (5 sections approved_at NOT NULL uniquement)
 * - Misconceptions / pièges
 * - Stats : X répondues, Y correctes
 *
 * Cohérent avec curation prof S2B :
 * - Lit même tables (concepts, theory_blocks approved, concept_misconceptions)
 * - Filtre `approved_at IS NOT NULL` (RLS élève déjà strict mais double-check)
 * - Tenant check : concept.school_id == profile.school_id
 *
 * Pas d'audit log (lecture seule).
 */
export const metadata = {
  title: "Concept · Maïa",
};

const SECTION_LABELS: Record<SectionKind, string> = {
  definition: "Définition",
  formules: "Formules",
  exemples: "Exemples",
  prerequis: "Prérequis",
  pieges: "Pièges",
};

const SECTION_ICONS: Record<SectionKind, React.ReactNode> = {
  definition: <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />,
  formules: <Target size={16} strokeWidth={1.75} aria-hidden="true" />,
  exemples: <Check size={16} strokeWidth={1.75} aria-hidden="true" />,
  prerequis: <Lightbulb size={16} strokeWidth={1.75} aria-hidden="true" />,
  pieges: <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />,
};

export default async function ConceptDrillDownPage({
  params,
}: {
  params: { id: string };
}) {
  const { user } = await requireStudentPage();

  if (!UUID_REGEX.test(params.id)) {
    notFound();
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Profile pour tenant scope
  const profileRes = await admin
    .from("user_profiles")
    .select("school_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;
  const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
  if (!schoolId) notFound();

  // 2. Fetch concept + theory + misconceptions + élève stats (parallèle)
  const [conceptRes, theoryRes, misconceptionsRes, answersRes] = await Promise.all([
    admin
      .from("concepts")
      .select("id, name, slug, description, source_quote, school_id")
      .eq("id", params.id)
      .maybeSingle(),
    admin
      .from("theory_blocks")
      .select("id, paragraph_ordinal, section_kind, content, approved_at")
      .eq("concept_id", params.id)
      .not("approved_at", "is", null)
      .order("paragraph_ordinal", { ascending: true }),
    admin
      .from("concept_misconceptions")
      .select("id, label, ordinal")
      .eq("concept_id", params.id)
      .order("ordinal", { ascending: true }),
    // Stats élève : ses réponses sur des questions de ce concept
    admin
      .from("assignment_question_answers")
      .select("question_id, is_correct, teacher_questions!inner(concept_id)")
      .eq("student_user_id", user.id)
      .eq("teacher_questions.concept_id", params.id),
  ]);
  if (conceptRes.error) throw conceptRes.error;
  if (theoryRes.error) throw theoryRes.error;
  if (misconceptionsRes.error) throw misconceptionsRes.error;
  if (answersRes.error) throw answersRes.error;

  const concept = conceptRes.data as
    | {
        id: string;
        name: string;
        slug: string;
        description: string | null;
        source_quote: string | null;
        school_id: string;
      }
    | null;
  if (!concept) notFound();
  if (concept.school_id !== schoolId) notFound();

  type TheoryBlock = {
    id: string;
    paragraph_ordinal: number;
    section_kind: SectionKind | null;
    content: string;
    approved_at: string | null;
  };
  const theoryBlocks = (theoryRes.data as TheoryBlock[] | null) ?? [];

  // Map section_kind → block (1 par kind, premier rencontré)
  const theoryBySection = new Map<SectionKind, TheoryBlock>();
  for (const block of theoryBlocks) {
    if (block.section_kind && !theoryBySection.has(block.section_kind)) {
      theoryBySection.set(block.section_kind, block);
    }
  }

  const misconceptions =
    (misconceptionsRes.data as { id: string; label: string; ordinal: number }[] | null) ?? [];

  // Stats élève — Supabase retourne les jointures en array
  type AnswerRow = {
    question_id: string;
    is_correct: boolean;
    teacher_questions: { concept_id: string | null }[] | null;
  };
  const answers = (answersRes.data as AnswerRow[] | null) ?? [];
  const totalAnswered = answers.length;
  const correctCount = answers.filter((a) => a.is_correct).length;
  const masteryPct = totalAnswered === 0 ? 0 : Math.round((100 * correctCount) / totalAnswered);
  const level = masteryLevel(masteryPct);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-6 sm:px-6" lang="fr-BE">
      <nav aria-label="Fil d'Ariane" className="mb-4">
        <Link
          href="/accueil"
          className="
            inline-flex items-center gap-1.5 rounded-md text-sm text-slate-600 transition
            hover:text-slate-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:text-slate-400 dark:hover:text-slate-200
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Retour à mon accueil
        </Link>
      </nav>

      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
          Concept
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {concept.name}
          </h1>
          <span
            aria-label={`Maîtrise ${masteryPct}% — ${masteryLabel(level)}`}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${masteryCellClass(level)}`}
          >
            {totalAnswered === 0 ? "Non évalué" : `${masteryPct}%`}
          </span>
        </div>
        {concept.description ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {concept.description}
          </p>
        ) : null}
        {totalAnswered > 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            <strong>{correctCount}</strong> bonnes réponses sur{" "}
            <strong>{totalAnswered}</strong> question{totalAnswered > 1 ? "s" : ""}{" "}
            répondue{totalAnswered > 1 ? "s" : ""}
          </p>
        ) : null}
      </header>

      {/* Théorie 5 sections */}
      <section aria-labelledby="theorie-title" className="mb-6">
        <h2
          id="theorie-title"
          className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
          La théorie à retenir
        </h2>
        {theoryBySection.size === 0 ? (
          <p
            role="status"
            className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            Ton prof n&apos;a pas encore préparé de fiche théorie pour ce concept.
            Reviens un peu plus tard.
          </p>
        ) : (
          <div className="space-y-3">
            {SECTION_KINDS.map((kind) => {
              const block = theoryBySection.get(kind);
              if (!block) return null;
              return (
                <article
                  key={kind}
                  aria-labelledby={`section-${kind}-title`}
                  className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <h3
                    id={`section-${kind}-title`}
                    className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-400"
                  >
                    {SECTION_ICONS[kind]}
                    {SECTION_LABELS[kind]}
                  </h3>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {block.content}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Pièges connus (misconceptions) */}
      {misconceptions.length > 0 ? (
        <section
          aria-labelledby="misconceptions-title"
          className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <h2
            id="misconceptions-title"
            className="mb-3 flex items-center gap-2 text-base font-semibold text-amber-900 dark:text-amber-200"
          >
            <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
            Pièges fréquents
          </h2>
          <ul role="list" className="space-y-2">
            {misconceptions.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200"
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-200"
                >
                  {m.ordinal}
                </span>
                <span>{m.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* CTA */}
      <nav aria-label="Actions" className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/accueil/devoirs"
          className="
            inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
            text-sm font-semibold text-white transition
            hover:bg-indigo-700
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
          Voir mes devoirs
        </Link>
        <Link
          href="/accueil"
          className="
            inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2
            text-sm font-medium text-slate-700 transition
            hover:bg-slate-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          Retour à mon accueil
        </Link>
      </nav>
    </main>
  );
}
