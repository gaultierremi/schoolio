"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

type ReviewTab = "summary" | "quiz" | "flashcards";

export type PostCoursReviewPanelProps = {
  summary: string;
  quiz: Array<{
    question: string;
    expected_answer: string;
  }>;
  flashcards: Array<{
    concept: string;
    definition: string;
  }>;
  onSummaryChange: (newSummary: string) => void;
  onQuizChange: (
    index: number,
    updated: { question: string; expected_answer: string },
  ) => void;
  onFlashcardChange: (
    index: number,
    updated: { concept: string; definition: string },
  ) => void;
  onValidate: () => void;
  onCancel: () => void;
  onFlashcardAdd?: () => void;
  onFlashcardRemove?: (index: number) => void;
};

const tabs: Array<{ id: ReviewTab; label: string }> = [
  { id: "summary", label: "Résumé" },
  { id: "quiz", label: "Quiz" },
  { id: "flashcards", label: "Flashcards" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--maia-muted,#6b7280)]">
      {children}
    </label>
  );
}

export default function PostCoursReviewPanel({
  summary,
  quiz,
  flashcards,
  onSummaryChange,
  onQuizChange,
  onFlashcardChange,
  onValidate,
  onCancel,
  onFlashcardAdd,
  onFlashcardRemove,
}: PostCoursReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("summary");
  const [editingQuizIndex, setEditingQuizIndex] = useState<number | null>(null);
  const [editingFlashcardIndex, setEditingFlashcardIndex] = useState<number | null>(null);

  return (
    <section className="w-full rounded-2xl border border-[var(--maia-border,#e5e7eb)] bg-[var(--maia-surface,#ffffff)] text-[var(--maia-text,#111827)]">
      <header className="border-b border-[var(--maia-border,#e5e7eb)] px-6 py-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--maia-muted,#6b7280)]">
          Post-cours
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Maia a généré ces livrables — relisez et envoyez
        </h2>
      </header>

      <div className="px-6 pt-6">
        <div className="flex gap-8 border-b border-[var(--maia-border,#e5e7eb)]" role="tablist">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cx(
                  "border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
                  isActive
                    ? "border-[var(--maia-accent,#4f46e5)] text-[var(--maia-accent,#4f46e5)]"
                    : "border-transparent text-[var(--maia-muted,#6b7280)] hover:text-[var(--maia-text,#111827)]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-6">
        {activeTab === "summary" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <FieldLabel>Résumé éditable</FieldLabel>
              <textarea
                value={summary}
                onChange={(event) => onSummaryChange(event.target.value)}
                className="min-h-[360px] w-full resize-y rounded-xl border border-[var(--maia-border,#e5e7eb)] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--maia-accent,#4f46e5)] focus:ring-2 focus:ring-[var(--maia-accent-soft,rgba(79,70,229,0.14))]"
              />
            </div>

            <div className="space-y-3">
              <FieldLabel>Aperçu markdown</FieldLabel>
              <div className="min-h-[360px] rounded-xl border border-[var(--maia-border,#e5e7eb)] bg-[var(--maia-subtle,#f9fafb)] px-5 py-4">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold">{children}</h1>,
                    h2: ({ children }) => <h2 className="mb-3 text-lg font-semibold">{children}</h2>,
                    p: ({ children }) => <p className="mb-3 text-sm leading-6">{children}</p>,
                    ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6">{children}</ol>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  }}
                >
                  {summary}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "quiz" ? (
          <div className="space-y-6">
            {quiz.map((item, index) => {
              const isEditing = editingQuizIndex === index;

              return (
                <article
                  key={`quiz-${index}`}
                  className="rounded-xl border border-[var(--maia-border,#e5e7eb)] bg-white p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-base font-semibold">Question {index + 1}</h3>
                    <button
                      type="button"
                      onClick={() => setEditingQuizIndex(isEditing ? null : index)}
                      className="self-start rounded-lg border border-[var(--maia-border,#e5e7eb)] px-3 py-2 text-sm font-semibold text-[var(--maia-text,#111827)] transition hover:bg-[var(--maia-subtle,#f9fafb)]"
                    >
                      {isEditing ? "Terminer" : "Éditer"}
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel>Question</FieldLabel>
                      {isEditing ? (
                        <textarea
                          value={item.question}
                          onChange={(event) =>
                            onQuizChange(index, {
                              ...item,
                              question: event.target.value,
                            })
                          }
                          className="min-h-28 w-full resize-y rounded-lg border border-[var(--maia-border,#e5e7eb)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--maia-accent,#4f46e5)] focus:ring-2 focus:ring-[var(--maia-accent-soft,rgba(79,70,229,0.14))]"
                        />
                      ) : (
                        <p className="rounded-lg bg-[var(--maia-subtle,#f9fafb)] px-3 py-3 text-sm leading-6">
                          {item.question}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <FieldLabel>Réponse attendue</FieldLabel>
                      {isEditing ? (
                        <textarea
                          value={item.expected_answer}
                          onChange={(event) =>
                            onQuizChange(index, {
                              ...item,
                              expected_answer: event.target.value,
                            })
                          }
                          className="min-h-28 w-full resize-y rounded-lg border border-[var(--maia-border,#e5e7eb)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--maia-accent,#4f46e5)] focus:ring-2 focus:ring-[var(--maia-accent-soft,rgba(79,70,229,0.14))]"
                        />
                      ) : (
                        <p className="rounded-lg bg-[var(--maia-subtle,#f9fafb)] px-3 py-3 text-sm leading-6">
                          {item.expected_answer}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {activeTab === "flashcards" ? (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onFlashcardAdd}
                disabled={!onFlashcardAdd}
                className="rounded-lg border border-[var(--maia-border,#e5e7eb)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--maia-subtle,#f9fafb)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ajouter une flashcard
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {flashcards.map((item, index) => {
                const isEditing = editingFlashcardIndex === index;

                return (
                  <article
                    key={`flashcard-${index}`}
                    className="rounded-xl border border-[var(--maia-border,#e5e7eb)] bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold">Flashcard {index + 1}</h3>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingFlashcardIndex(isEditing ? null : index)}
                          className="rounded-lg border border-[var(--maia-border,#e5e7eb)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--maia-subtle,#f9fafb)]"
                        >
                          {isEditing ? "Terminer" : "Éditer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onFlashcardRemove?.(index)}
                          disabled={!onFlashcardRemove}
                          className="rounded-lg border border-[var(--maia-border,#e5e7eb)] px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <FieldLabel>Concept</FieldLabel>
                        {isEditing ? (
                          <input
                            value={item.concept}
                            onChange={(event) =>
                              onFlashcardChange(index, {
                                ...item,
                                concept: event.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-[var(--maia-border,#e5e7eb)] px-3 py-2 text-sm outline-none focus:border-[var(--maia-accent,#4f46e5)] focus:ring-2 focus:ring-[var(--maia-accent-soft,rgba(79,70,229,0.14))]"
                          />
                        ) : (
                          <p className="text-sm font-semibold">{item.concept}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <FieldLabel>Définition</FieldLabel>
                        {isEditing ? (
                          <textarea
                            value={item.definition}
                            onChange={(event) =>
                              onFlashcardChange(index, {
                                ...item,
                                definition: event.target.value,
                              })
                            }
                            className="min-h-24 w-full resize-y rounded-lg border border-[var(--maia-border,#e5e7eb)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--maia-accent,#4f46e5)] focus:ring-2 focus:ring-[var(--maia-accent-soft,rgba(79,70,229,0.14))]"
                          />
                        ) : (
                          <p className="text-sm leading-6 text-[var(--maia-muted,#4b5563)]">
                            {item.definition}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="flex flex-col gap-3 border-t border-[var(--maia-border,#e5e7eb)] px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--maia-border,#e5e7eb)] px-5 py-3 text-sm font-semibold transition hover:bg-[var(--maia-subtle,#f9fafb)]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onValidate}
          className="rounded-lg bg-[var(--maia-accent,#4f46e5)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--maia-accent-hover,#4338ca)]"
        >
          Envoyer aux élèves ✓
        </button>
      </footer>
    </section>
  );
}
