"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, BookText, Lightbulb, ListChecks, Quote } from "lucide-react";
import { SECTION_KINDS, type SectionKind } from "@/lib/curation/validation";
import TheorySection from "./_components/TheorySection";
import MisconceptionsList from "./_components/MisconceptionsList";
import QuestionsList from "./_components/QuestionsList";
import SourceQuoteBadge from "./_components/SourceQuoteBadge";
import Toast from "./_components/Toast";
import type {
  ConceptEditorData,
  MisconceptionRow,
  QuestionRow,
  TheoryBlockRow,
} from "./types";

const SECTION_LABELS: Record<SectionKind, string> = {
  definition: "Définition",
  formules: "Formules",
  exemples: "Exemples",
  prerequis: "Prérequis",
  pieges: "Pièges",
};

/**
 * Vue concept unifiée prof (Sprint 2B PR B).
 *
 * Conforme `project_curation_concept_view` :
 * - 5 sections théorie typées (def / formules / exemples / prerequis / pieges)
 * - Slider on/off seul par question (Radix Switch a11y AA)
 * - Misconceptions add/edit/delete
 * - `source_quote` read-only
 * - Block "Théorie non classée" pour rows legacy avec section_kind=NULL
 *
 * A11y (WCAG 2.2 AA strict, décision Alex) :
 * - `<section aria-labelledby>` partout
 * - Heading hierarchy h1 → h2 → h3
 * - Radix Switch pour les sliders (role=switch + aria-checked auto)
 * - Toast `role="status"` + `aria-live="polite"`
 * - Focus rings visibles, reduced motion
 * - Form errors annoncés via Toast
 */
export default function ConceptEditor({ initialData }: { initialData: ConceptEditorData }) {
  const [theoryBlocks, setTheoryBlocks] = useState<TheoryBlockRow[]>(initialData.theoryBlocks);
  const [questions, setQuestions] = useState<QuestionRow[]>(initialData.questions);
  const [misconceptions, setMisconceptions] = useState<MisconceptionRow[]>(
    initialData.misconceptions,
  );
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const concept = initialData.concept;

  // Map des sections classées par section_kind (5 max, 1 par kind)
  const theoryBySection = useMemo(() => {
    const map = new Map<SectionKind, TheoryBlockRow>();
    for (const block of theoryBlocks) {
      if (block.section_kind && !map.has(block.section_kind)) {
        map.set(block.section_kind, block);
      }
    }
    return map;
  }, [theoryBlocks]);

  // Rows legacy à classer (section_kind = NULL)
  const unclassifiedBlocks = useMemo(
    () => theoryBlocks.filter((b) => b.section_kind === null),
    [theoryBlocks],
  );

  const activeQuestionsCount = useMemo(
    () => questions.filter((q) => q.is_active).length,
    [questions],
  );

  // ── Callbacks de mise à jour optimiste ──

  const handleTheoryUpdate = useCallback(
    (kind: SectionKind, updated: TheoryBlockRow) => {
      setTheoryBlocks((prev) => {
        // Si une row existe déjà pour ce kind → remplace
        const existing = prev.find((b) => b.section_kind === kind);
        if (existing) {
          return prev.map((b) => (b.id === existing.id ? updated : b));
        }
        // Sinon → ajoute
        return [...prev, updated];
      });
      setToast({ message: `Section "${SECTION_LABELS[kind]}" enregistrée`, tone: "success" });
    },
    [],
  );

  const handleQuestionToggle = useCallback((questionId: string, nextActive: boolean) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, is_active: nextActive } : q)),
    );
    setToast({
      message: nextActive ? "Question activée" : "Question désactivée",
      tone: "success",
    });
  }, []);

  const handleMisconceptionAdd = useCallback((newOne: MisconceptionRow) => {
    setMisconceptions((prev) => [...prev, newOne].sort((a, b) => a.ordinal - b.ordinal));
    setToast({ message: "Misconception ajoutée", tone: "success" });
  }, []);

  const handleMisconceptionUpdate = useCallback((updated: MisconceptionRow) => {
    setMisconceptions((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m)).sort((a, b) => a.ordinal - b.ordinal),
    );
    setToast({ message: "Misconception modifiée", tone: "success" });
  }, []);

  const handleMisconceptionDelete = useCallback((id: string) => {
    setMisconceptions((prev) => prev.filter((m) => m.id !== id));
    setToast({ message: "Misconception supprimée", tone: "success" });
  }, []);

  const handleError = useCallback((message: string) => {
    setToast({ message, tone: "error" });
  }, []);

  return (
    <main
      className="mx-auto min-h-dvh max-w-5xl bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6"
      lang="fr-BE"
    >
      {/* ── Header ── */}
      <nav aria-label="Fil d'Ariane" className="mb-4">
        <Link
          href="/accueil/curation"
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
          Retour aux concepts
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {concept.name}
          </h1>
          {concept.description ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {concept.description}
            </p>
          ) : null}
        </div>
        <SourceQuoteBadge
          sourceQuote={concept.source_quote}
          sourceConceptPath={concept.source_concept_path}
        />
      </header>

      {/* ── Théorie ── */}
      <section aria-labelledby="theorie-title" className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <BookText
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
            className="text-slate-700 dark:text-slate-300"
          />
          <h2
            id="theorie-title"
            className="text-xl font-semibold text-slate-900 dark:text-slate-100"
          >
            Théorie
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SECTION_KINDS.map((kind) => (
            <TheorySection
              key={kind}
              conceptId={concept.id}
              sectionKind={kind}
              label={SECTION_LABELS[kind]}
              block={theoryBySection.get(kind) ?? null}
              onUpdate={(updated) => handleTheoryUpdate(kind, updated)}
              onError={handleError}
            />
          ))}
        </div>

        {/* Rows legacy à classer (section_kind = NULL) */}
        {unclassifiedBlocks.length > 0 ? (
          <div
            className="
              mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5
              dark:border-amber-800 dark:bg-amber-950/30
            "
            role="region"
            aria-labelledby="unclassified-title"
          >
            <h3
              id="unclassified-title"
              className="text-sm font-semibold text-amber-900 dark:text-amber-200"
            >
              Théorie à classer ({unclassifiedBlocks.length})
            </h3>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
              Ces paragraphes ont été générés par l&apos;ingestion automatique. Classe-les dans une
              section pour qu&apos;ils apparaissent dans les fiches élèves. (Édition de
              classification arrivera en Sprint&nbsp;2C — pour l&apos;instant ils restent visibles
              ici sans bloquer l&apos;UX.)
            </p>
            <ul className="mt-3 space-y-2">
              {unclassifiedBlocks.map((b) => (
                <li
                  key={b.id}
                  className="
                    rounded-lg bg-white p-3 text-sm text-slate-700
                    dark:bg-slate-900 dark:text-slate-300
                  "
                >
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    Paragraphe {b.paragraph_ordinal} :
                  </span>{" "}
                  {b.content.slice(0, 200)}
                  {b.content.length > 200 ? "…" : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── Questions ── */}
      <section aria-labelledby="questions-title" className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <ListChecks
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
            className="text-slate-700 dark:text-slate-300"
          />
          <h2
            id="questions-title"
            className="text-xl font-semibold text-slate-900 dark:text-slate-100"
          >
            Questions
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({activeQuestionsCount} active{activeQuestionsCount > 1 ? "s" : ""} sur{" "}
              {questions.length})
            </span>
          </h2>
        </div>
        <QuestionsList
          questions={questions}
          onToggle={handleQuestionToggle}
          onError={handleError}
        />
      </section>

      {/* ── Misconceptions ── */}
      <section aria-labelledby="misconceptions-title" className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
            className="text-slate-700 dark:text-slate-300"
          />
          <h2
            id="misconceptions-title"
            className="text-xl font-semibold text-slate-900 dark:text-slate-100"
          >
            Misconceptions
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({misconceptions.length}/10)
            </span>
          </h2>
        </div>
        <MisconceptionsList
          conceptId={concept.id}
          misconceptions={misconceptions}
          onAdd={handleMisconceptionAdd}
          onUpdate={handleMisconceptionUpdate}
          onDelete={handleMisconceptionDelete}
          onError={handleError}
        />
      </section>

      {/* ── Toast a11y (aria-live polite) ── */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Quote icon used in source badge a11y */}
      <span aria-hidden="true" className="hidden">
        <Quote />
      </span>
    </main>
  );
}
