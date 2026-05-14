"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, Send, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

export type PostCoursQuizItem = {
  question: string;
  expected_answer: string;
};

export type PostCoursFlashcardItem = {
  concept: string;
  definition: string;
};

export type PostCoursHomeworkItem = {
  title: string;
  instructions: string;
  dueLabel: string;
  estimatedMinutes: number;
};

export type PostCoursReviewPanelProps = {
  summary: string;
  quiz: PostCoursQuizItem[];
  flashcards: PostCoursFlashcardItem[];
  homework?: PostCoursHomeworkItem[];
  onSummaryChange: (newSummary: string) => void;
  onQuizChange: (index: number, updated: PostCoursQuizItem) => void;
  onFlashcardChange: (index: number, updated: PostCoursFlashcardItem) => void;
  onFlashcardAdd?: () => void;
  onFlashcardRemove?: (index: number) => void;
  onHomeworkChange?: (index: number, updated: PostCoursHomeworkItem) => void;
  onValidate: () => void;
  onCancel: () => void;
};

type TabId = "summary" | "quiz" | "flashcards" | "homework";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "summary", label: "Résumé" },
  { id: "quiz", label: "Quiz" },
  { id: "flashcards", label: "Flashcards" },
  { id: "homework", label: "Devoirs" },
];

const textareaClassName =
  "min-h-11 w-full resize-y rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-3 text-sm leading-6 text-[rgb(var(--ink))] outline-none transition-colors focus:border-[rgb(var(--accent))] disabled:opacity-60";

export function PostCoursReviewPanel({
  summary,
  quiz,
  flashcards,
  homework = [],
  onSummaryChange,
  onQuizChange,
  onFlashcardChange,
  onFlashcardAdd,
  onFlashcardRemove,
  onHomeworkChange,
  onValidate,
  onCancel,
}: PostCoursReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  const deliverableCount = useMemo(
    () => quiz.length + flashcards.length + homework.length + (summary.trim() ? 1 : 0),
    [flashcards.length, homework.length, quiz.length, summary],
  );

  return (
    <section className="mx-auto w-full max-w-6xl rounded-[28px] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 sm:p-8">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-[rgb(var(--accent))]">
              Post-cours Maia
            </p>
            <div className="space-y-2">
              <h1 className="serif text-3xl leading-tight text-[rgb(var(--ink))] sm:text-4xl">
                Maia a généré ces livrables
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[rgb(var(--ink-2))]">
                Relisez, ajustez puis envoyez aux élèves quand le contenu vous convient.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3 text-sm text-[rgb(var(--ink-2))]">
            <span className="font-semibold text-[rgb(var(--ink))]">{deliverableCount}</span>{" "}
            éléments à valider
          </div>
        </header>

        <nav aria-label="Livrables post-cours" className="border-b border-[rgb(var(--border))]">
          <div className="flex gap-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="relative min-h-12 whitespace-nowrap text-sm font-semibold transition-colors"
                style={{
                  color:
                    activeTab === tab.id
                      ? "rgb(var(--accent))"
                      : "rgb(var(--ink-2))",
                }}
              >
                {tab.label}
                {activeTab === tab.id ? (
                  <motion.span
                    layoutId="post-cours-review-underline"
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(var(--accent))]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
              </button>
            ))}
          </div>
        </nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "summary" ? (
              <SummaryTab summary={summary} onSummaryChange={onSummaryChange} />
            ) : null}
            {activeTab === "quiz" ? (
              <QuizTab quiz={quiz} onQuizChange={onQuizChange} />
            ) : null}
            {activeTab === "flashcards" ? (
              <FlashcardsTab
                flashcards={flashcards}
                onFlashcardAdd={onFlashcardAdd}
                onFlashcardChange={onFlashcardChange}
                onFlashcardRemove={onFlashcardRemove}
              />
            ) : null}
            {activeTab === "homework" ? (
              <HomeworkTab
                homework={homework}
                onHomeworkChange={onHomeworkChange}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>

        <footer className="flex flex-col-reverse gap-3 border-t border-[rgb(var(--border))] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[rgb(var(--border))] px-5 text-sm font-semibold text-[rgb(var(--ink))] transition-colors hover:bg-[rgb(var(--surface-2))]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Annuler
          </button>
          <button
            type="button"
            onClick={onValidate}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[rgb(var(--accent))] px-5 text-sm font-semibold text-[rgb(var(--surface))] transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] focus:ring-offset-2"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Envoyer aux élèves
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
        </footer>
      </div>
    </section>
  );
}

function SummaryTab({
  summary,
  onSummaryChange,
}: {
  summary: string;
  onSummaryChange: (newSummary: string) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Résumé éditable">
        <textarea
          value={summary}
          onChange={(event) => onSummaryChange(event.target.value)}
          rows={18}
          className="min-h-[420px] w-full resize-y rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4 text-sm leading-7 text-[rgb(var(--ink))] outline-none transition-colors focus:border-[rgb(var(--accent))]"
          aria-label="Résumé du cours"
        />
      </Panel>
      <Panel title="Aperçu élève">
        <div className="prose prose-sm max-w-none text-[rgb(var(--ink))] prose-headings:font-serif prose-headings:text-[rgb(var(--ink))] prose-p:leading-7 prose-li:leading-7">
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      </Panel>
    </div>
  );
}

function QuizTab({
  quiz,
  onQuizChange,
}: {
  quiz: PostCoursQuizItem[];
  onQuizChange: (index: number, updated: PostCoursQuizItem) => void;
}) {
  return (
    <div className="grid gap-5">
      {quiz.map((item, index) => (
        <Panel key={`quiz-${index}`} title={`Question ${index + 1}`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Question">
              <textarea
                value={item.question}
                onChange={(event) =>
                  onQuizChange(index, {
                    ...item,
                    question: event.target.value,
                  })
                }
                rows={4}
                className={textareaClassName}
              />
            </Field>
            <Field label="Réponse attendue">
              <textarea
                value={item.expected_answer}
                onChange={(event) =>
                  onQuizChange(index, {
                    ...item,
                    expected_answer: event.target.value,
                  })
                }
                rows={4}
                className={textareaClassName}
              />
            </Field>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function FlashcardsTab({
  flashcards,
  onFlashcardAdd,
  onFlashcardChange,
  onFlashcardRemove,
}: {
  flashcards: PostCoursFlashcardItem[];
  onFlashcardAdd?: () => void;
  onFlashcardChange: (index: number, updated: PostCoursFlashcardItem) => void;
  onFlashcardRemove?: (index: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onFlashcardAdd}
          disabled={!onFlashcardAdd}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[rgb(var(--border))] px-4 text-sm font-semibold text-[rgb(var(--accent))] transition-colors hover:bg-[rgb(var(--surface-2))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter une flashcard
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {flashcards.map((item, index) => (
          <Panel key={`flashcard-${index}`} title={`Flashcard ${index + 1}`}>
            <div className="space-y-4">
              <Field label="Concept">
                <textarea
                  value={item.concept}
                  onChange={(event) =>
                    onFlashcardChange(index, {
                      ...item,
                      concept: event.target.value,
                    })
                }
                rows={2}
                className={textareaClassName}
              />
              </Field>
              <Field label="Définition">
                <textarea
                  value={item.definition}
                  onChange={(event) =>
                    onFlashcardChange(index, {
                      ...item,
                      definition: event.target.value,
                    })
                }
                rows={4}
                className={textareaClassName}
              />
              </Field>
              <button
                type="button"
                onClick={() => onFlashcardRemove?.(index)}
                disabled={!onFlashcardRemove}
                className="inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[rgb(var(--ink-2))] transition-colors hover:bg-[rgb(var(--surface-2))] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Supprimer
              </button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function HomeworkTab({
  homework,
  onHomeworkChange,
}: {
  homework: PostCoursHomeworkItem[];
  onHomeworkChange?: (index: number, updated: PostCoursHomeworkItem) => void;
}) {
  if (homework.length === 0) {
    return (
      <Panel title="Devoirs">
        <p className="text-sm leading-7 text-[rgb(var(--ink-2))]">
          Aucun devoir généré pour ce cours.
        </p>
      </Panel>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[rgb(var(--border))]">
      <div className="hidden grid-cols-[1.2fr_1.7fr_0.8fr_0.6fr] gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--ink-3))] lg:grid">
        <span>Titre</span>
        <span>Consigne</span>
        <span>Échéance</span>
        <span>Temps</span>
      </div>
      <div className="divide-y divide-[rgb(var(--border))]">
        {homework.map((item, index) => (
          <div
            key={`homework-${index}`}
            className="grid gap-4 px-5 py-5 transition-colors hover:bg-[rgb(var(--surface-2))] lg:grid-cols-[1.2fr_1.7fr_0.8fr_0.6fr]"
          >
            <Field label="Titre">
              <textarea
                value={item.title}
                onChange={(event) =>
                  onHomeworkChange?.(index, {
                    ...item,
                    title: event.target.value,
                  })
                }
                rows={2}
                disabled={!onHomeworkChange}
                className={textareaClassName}
              />
            </Field>
            <Field label="Consigne">
              <textarea
                value={item.instructions}
                onChange={(event) =>
                  onHomeworkChange?.(index, {
                    ...item,
                    instructions: event.target.value,
                  })
                }
                rows={3}
                disabled={!onHomeworkChange}
                className={textareaClassName}
              />
            </Field>
            <Field label="Échéance">
              <textarea
                value={item.dueLabel}
                onChange={(event) =>
                  onHomeworkChange?.(index, {
                    ...item,
                    dueLabel: event.target.value,
                  })
                }
                rows={2}
                disabled={!onHomeworkChange}
                className={textareaClassName}
              />
            </Field>
            <Field label="Temps">
              <input
                type="number"
                min={0}
                value={item.estimatedMinutes}
                onChange={(event) =>
                  onHomeworkChange?.(index, {
                    ...item,
                    estimatedMinutes: Number(event.target.value),
                  })
                }
                disabled={!onHomeworkChange}
                className="min-h-11 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-[rgb(var(--ink))] outline-none transition-colors focus:border-[rgb(var(--accent))] disabled:opacity-60"
                aria-label="Temps estimé en minutes"
              />
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="mb-4 text-sm font-semibold text-[rgb(var(--ink))]">{title}</h2>
      {children}
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--ink-3))]">
        {label}
      </span>
      {children}
    </label>
  );
}
