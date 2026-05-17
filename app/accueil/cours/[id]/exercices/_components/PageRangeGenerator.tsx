"use client";

import { useId, useState } from "react";
import PageRangeSlider from "@/components/pdf/PageRangeSlider";

type Props = {
  courseId: string;
  pagesCount: number | null;
  courseTitle: string;
  onSuccess: (summary: { questions: number; exercises: number; start: number; end: number }) => void;
  onClose: () => void;
};

type GenType = "questions" | "exercises";

export function PageRangeGenerator({ courseId, pagesCount, courseTitle, onSuccess, onClose }: Props) {
  const defaultEnd = pagesCount ?? 10;
  const [range, setRange] = useState<[number, number]>([1, defaultEnd]);
  const [genTypes, setGenTypes] = useState<Set<GenType>>(new Set(["questions", "exercises"]));
  const [questionCount, setQuestionCount] = useState(30);
  const [exerciseCount, setExerciseCount] = useState(5);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function toggleType(t: GenType) {
    setGenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }

  async function launch() {
    setState("loading");
    setErrorMsg("");

    const [start, end] = range;
    const page_range = { start, end };

    const calls: Promise<Response>[] = [];

    if (genTypes.has("questions")) {
      calls.push(
        fetch("/api/courses/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, questionsCount: questionCount, page_range }),
        })
      );
    } else {
      calls.push(Promise.resolve(new Response(JSON.stringify({ success: true, questionsGenerated: 0 }), { status: 200 })));
    }

    if (genTypes.has("exercises")) {
      calls.push(
        fetch(`/api/courses/${courseId}/generate-exercises`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: exerciseCount, page_range }),
        })
      );
    } else {
      calls.push(Promise.resolve(new Response(JSON.stringify({ generated: 0 }), { status: 200 })));
    }

    try {
      const [qRes, eRes] = await Promise.all(calls);
      const [qData, eData] = await Promise.all([
        qRes.json() as Promise<{ success?: boolean; questionsGenerated?: number; error?: string }>,
        eRes.json() as Promise<{ generated?: number; error?: string }>,
      ]);

      const errors: string[] = [];
      if (!qRes.ok && genTypes.has("questions")) errors.push(qData.error ?? "Erreur questions");
      if (!eRes.ok && genTypes.has("exercises")) errors.push(eData.error ?? "Erreur exercices");

      if (errors.length > 0) {
        setErrorMsg(errors.join(" · "));
        setState("error");
        return;
      }

      onSuccess({
        questions: qData.questionsGenerated ?? 0,
        exercises: eData.generated ?? 0,
        start,
        end,
      });
    } catch {
      setErrorMsg("Erreur réseau, réessaie.");
      setState("error");
    }
  }

  const sliderKey = pagesCount !== null ? "with-pages" : "no-pages";

  const pageRangeLabelId = useId();
  const startPageId = useId();
  const endPageId = useId();
  const generateGroupId = useId();
  const questionCountId = useId();
  const exerciseCountId = useId();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Sprint 1.5 polish (a11y) : backdrop modal = presentation, Esc gere par contenu. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        role="presentation"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={state === "idle" ? onClose : undefined}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-2xl">
        {state === "loading" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
            <p className="font-black text-[rgb(var(--ink))]">Génération en cours via Maïa…</p>
            <p className="text-sm text-[rgb(var(--ink-2))]">
              Maïa analyse les pages {range[0]}–{range[1]} de «{courseTitle}» et génère ton contenu.
            </p>
          </div>
        ) : (
          <>
            <h2 className="serif text-lg font-black text-[rgb(var(--ink))]">🎯 Générer sur une sélection de pages</h2>
            <p className="mt-1 truncate text-sm text-[rgb(var(--ink-2))]">{courseTitle}</p>

            {/* Page range */}
            <div className="mt-5" role="group" aria-labelledby={pageRangeLabelId}>
              <div className="mb-2 flex items-center justify-between">
                <span id={pageRangeLabelId} className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                  Plage de pages
                </span>
                <span className="text-sm font-bold text-[rgb(var(--ink))]">
                  Pages {range[0]} → {range[1]}
                  {pagesCount !== null && (
                    <span className="font-normal text-[rgb(var(--ink-3))]"> sur {pagesCount}</span>
                  )}
                </span>
              </div>
              {pagesCount !== null ? (
                <PageRangeSlider
                  key={sliderKey}
                  totalPages={pagesCount}
                  value={range}
                  onChange={setRange}
                  minRange={1}
                />
              ) : (
                /* Fallback: 2 number inputs when pages_count is unknown */
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor={startPageId} className="mb-1 block text-xs text-[rgb(var(--ink-3))]">Page de début</label>
                    <input
                      id={startPageId}
                      type="number"
                      min={1}
                      value={range[0]}
                      onChange={(e) => {
                        const v = Math.max(1, parseInt(e.target.value) || 1);
                        setRange([v, Math.max(v, range[1])]);
                      }}
                      className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))]"
                    />
                  </div>
                  <span className="mt-5 text-[rgb(var(--ink-3))]">→</span>
                  <div className="flex-1">
                    <label htmlFor={endPageId} className="mb-1 block text-xs text-[rgb(var(--ink-3))]">Page de fin</label>
                    <input
                      id={endPageId}
                      type="number"
                      min={range[0]}
                      value={range[1]}
                      onChange={(e) => {
                        const v = Math.max(range[0], parseInt(e.target.value) || range[0]);
                        setRange([range[0], v]);
                      }}
                      className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Type toggles */}
            <div className="mt-5" role="group" aria-labelledby={generateGroupId}>
              <span id={generateGroupId} className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                Générer
              </span>
              <div className="mt-2 flex gap-3">
                {(["questions", "exercises"] as const).map((t) => {
                  const active = genTypes.has(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleType(t)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold transition-all ${
                        active
                          ? "border-[rgb(var(--accent))]/50 bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]"
                          : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${active ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]" : "border-[rgb(var(--border))]"}`}>
                        {active && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {t === "questions" ? "Questions QCM" : "Exercices"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Counts */}
            <div className="mt-4 flex gap-4">
              {genTypes.has("questions") && (
                <div className="flex-1">
                  <label htmlFor={questionCountId} className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                    Nb de questions
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      id={questionCountId}
                      type="range"
                      min={5}
                      max={50}
                      step={5}
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="flex-1 accent-[rgb(var(--accent))]"
                    />
                    <span className="w-8 text-center font-black text-[rgb(var(--ink))]">{questionCount}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">entre 5 et 50</p>
                </div>
              )}
              {genTypes.has("exercises") && (
                <div className="flex-1">
                  <label htmlFor={exerciseCountId} className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                    Nb d&apos;exercices
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      id={exerciseCountId}
                      type="range"
                      min={3}
                      max={10}
                      value={exerciseCount}
                      onChange={(e) => setExerciseCount(Number(e.target.value))}
                      className="flex-1 accent-[rgb(var(--accent))]"
                    />
                    <span className="w-8 text-center font-black text-[rgb(var(--ink))]">{exerciseCount}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">entre 3 et 10</p>
                </div>
              )}
            </div>

            {state === "error" && (
              <div className="mt-4 rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-3 text-sm font-bold text-[rgb(var(--red))]">
                {errorMsg}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-bold text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              >
                Annuler
              </button>
              <button
                onClick={launch}
                className="rounded-xl bg-[rgb(var(--accent))] px-5 py-2 text-sm font-black text-white hover:opacity-90"
              >
                Lancer la génération
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
