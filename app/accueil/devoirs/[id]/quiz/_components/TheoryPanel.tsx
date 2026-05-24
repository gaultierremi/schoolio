"use client";

import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Lightbulb, Loader2, Target, TriangleAlert, X } from "lucide-react";

/**
 * Panel théorie intégré au quiz (remplace l'ouverture PDF).
 *
 * Fetch /api/student/concept/[id]/theory et affiche les blocks `approved`
 * du concept, plus les misconceptions (pièges).
 *
 * Mémoire `feedback_lucide_icons_except_tutor` : icônes Lucide partout.
 *
 * Math rendering : si content contient $...$ ou $$...$$, on délègue à
 * KaTeX (déjà importé via app/layout.tsx). Pour MVP, on render comme du
 * texte préformaté (whitespace-pre-wrap) ; KaTeX renderer plus tard si
 * tprofs incluent vraiment des formules LaTeX dans theory_blocks.content.
 *
 * Note : si Pipeline A text-only a raté les formules en image du PDF
 * d'origine (ex: V = πr²h/3 du cône), elles ne sont pas dans
 * theory_blocks.content. Solution : ré-ingestion Pipeline B image-aware
 * (dette tech).
 */

type Block = {
  id: string;
  paragraph_ordinal: number;
  section_kind: "definition" | "formules" | "exemples" | "prerequis" | "pieges" | null;
  content: string;
};

type Misconception = {
  id: string;
  label: string;
  ordinal: number;
};

type Concept = {
  id: string;
  name: string;
  description: string | null;
};

const SECTION_LABELS: Record<NonNullable<Block["section_kind"]>, string> = {
  definition: "Définition",
  formules: "Formules",
  exemples: "Exemples",
  prerequis: "Prérequis",
  pieges: "Pièges",
};

const SECTION_ORDER: Array<NonNullable<Block["section_kind"]>> = [
  "definition",
  "formules",
  "exemples",
  "prerequis",
  "pieges",
];

function SectionIcon({ kind }: { kind: NonNullable<Block["section_kind"]> }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  switch (kind) {
    case "definition":
      return <BookOpen {...props} />;
    case "formules":
      return <Target {...props} />;
    case "exemples":
      return <CheckCircle2 {...props} />;
    case "prerequis":
      return <Lightbulb {...props} />;
    case "pieges":
      return <TriangleAlert {...props} />;
  }
}

export function TheoryPanel({
  conceptId,
  onClose,
}: {
  conceptId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<
    | { concept: Concept; blocks: Block[]; misconceptions: Misconception[] }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/student/concept/${conceptId}/theory`);
        const json = (await res.json()) as
          | { concept: Concept; blocks: Block[]; misconceptions: Misconception[] }
          | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in json) {
          setError("error" in json ? json.error : "Erreur de chargement");
          return;
        }
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur réseau");
      }
    }
    void load();

    // Lock body scroll pendant que la modale est ouverte
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Escape close
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [conceptId, onClose]);

  // Group blocks par section, garder le 1er par kind
  const blocksBySection = new Map<NonNullable<Block["section_kind"]>, Block>();
  const unclassified: Block[] = [];
  if (data) {
    for (const b of data.blocks) {
      if (b.section_kind && !blocksBySection.has(b.section_kind)) {
        blocksBySection.set(b.section_kind, b);
      } else if (!b.section_kind) {
        unclassified.push(b);
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="theory-panel-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="
          flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl
          bg-white shadow-2xl
          dark:bg-slate-900
          sm:rounded-2xl
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
              Théorie
            </p>
            <h2
              id="theory-panel-title"
              className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100"
            >
              {data?.concept.name ?? "Chargement…"}
            </h2>
            {data?.concept.description ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {data.concept.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panel théorie"
            className="
              -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
              text-slate-500 transition
              hover:bg-slate-100 hover:text-slate-700
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200
              motion-reduce:transition-none
            "
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              Impossible de charger la théorie : {error}
            </div>
          ) : !data ? (
            <div
              aria-busy="true"
              className="flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-400"
            >
              <Loader2
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              Chargement de la théorie…
            </div>
          ) : data.blocks.length === 0 && data.misconceptions.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Ton prof n&apos;a pas encore préparé de fiche théorie pour ce
              concept. Reviens un peu plus tard.
            </p>
          ) : (
            <div className="space-y-4">
              {SECTION_ORDER.map((kind) => {
                const block = blocksBySection.get(kind);
                if (!block) return null;
                return (
                  <section
                    key={kind}
                    aria-labelledby={`section-${kind}-title`}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <h3
                      id={`section-${kind}-title`}
                      className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-400"
                    >
                      <SectionIcon kind={kind} />
                      {SECTION_LABELS[kind]}
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {block.content}
                    </p>
                  </section>
                );
              })}

              {unclassified.length > 0 ? (
                <section className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                  <h3 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Notes complémentaires
                  </h3>
                  {unclassified.map((b) => (
                    <p
                      key={b.id}
                      className="whitespace-pre-wrap text-sm leading-relaxed text-amber-900 dark:text-amber-200"
                    >
                      {b.content}
                    </p>
                  ))}
                </section>
              ) : null}

              {data.misconceptions.length > 0 ? (
                <section
                  aria-labelledby="misconceptions-title"
                  className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"
                >
                  <h3
                    id="misconceptions-title"
                    className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200"
                  >
                    <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
                    Pièges fréquents
                  </h3>
                  <ul role="list" className="space-y-2">
                    {data.misconceptions.map((m) => (
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
