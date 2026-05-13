"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Lightbulb, BookOpen, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";

type RenderedHint = {
  id: string;
  ordinal: number;
  text: string;
  kind: "validation" | "guided_question" | "encouragement" | "strong_hint";
};

type Props = {
  questionId: string;
  /** Réponse fausse de l'élève — substituée dans les slots {wrong_answer}. */
  wrongAnswer: string;
  /** Page PDF associée à la théorie pour cette question (null = pas de lien). */
  theoryPage: number | null;
  /** Handler du bouton "Revoir la théorie" — déjà câblé dans la page quiz. */
  onOpenTheory: () => void;
  /** Indique si le PDF de théorie est en cours d'ouverture. */
  theoryLoading?: boolean;
};

const INITIAL_REVEAL_COUNT = 3; // mockup montre 3 bulles en cascade auto
const CASCADE_DELAY_MS = 800;   // mockup : 0 / 800 / 1600

export function TutorPanel({
  questionId,
  wrongAnswer,
  theoryPage,
  onOpenTheory,
  theoryLoading,
}: Props) {
  const [hints, setHints] = useState<RenderedHint[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  // Fetch hints au montage
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const url = `/api/tutor/hints?question_id=${encodeURIComponent(questionId)}&wrong_answer=${encodeURIComponent(wrongAnswer)}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (!cancelled) setHints([]);
          return;
        }
        const data = (await res.json()) as { hints?: RenderedHint[] };
        if (!cancelled) {
          setHints(data.hints ?? []);
          setRevealedCount(Math.min(INITIAL_REVEAL_COUNT, (data.hints ?? []).length));
        }
      } catch {
        if (!cancelled) setHints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [questionId, wrongAnswer]);

  const visibleHints = useMemo(() => hints.slice(0, revealedCount), [hints, revealedCount]);
  const canRevealMore = revealedCount < hints.length;

  function handleRevealMore() {
    if (canRevealMore) {
      setRevealedCount((n) => Math.min(n + 1, hints.length));
    }
  }

  // ── Fallback : aucun hint approuvé pour cette question ─────────────────────
  // On garde l'UX dégradée mais propre : "Revoir la théorie" seule.
  if (!loading && hints.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-800/40 bg-blue-950/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-blue-300">
          <Sparkles className="h-4 w-4" />
          Tuteur Maïa
        </div>
        <p className="mb-3 text-sm text-blue-200">
          Pas d&apos;indice rédigé pour cette question. Consulte la théorie pour t&apos;aider.
        </p>
        <button
          onClick={onOpenTheory}
          disabled={!theoryPage || theoryLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-700/50 bg-blue-950/40 px-3 py-1.5 text-sm font-bold text-blue-200 transition hover:border-blue-500 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {theoryLoading ? "Chargement…" : theoryPage ? `Revoir la théorie (p. ${theoryPage})` : "Théorie indisponible"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-800/40 bg-blue-950/30">
      <header className="flex items-center gap-2 border-b border-blue-800/40 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20">
          <Sparkles className="h-3.5 w-3.5 text-blue-300" />
        </div>
        <div>
          <p className="text-sm font-bold text-blue-100">Tuteur Maïa</p>
          <p className="text-[10px] text-blue-300/80">
            il t&apos;analyse · ne donne jamais la réponse
          </p>
        </div>
      </header>

      <div className="space-y-2 p-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-blue-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Le tuteur prépare tes indices…
          </div>
        )}

        {visibleHints.map((h, i) => (
          <div
            key={h.id}
            className="animate-tutor-slide-up rounded-2xl rounded-tl-sm bg-blue-900/40 px-3 py-2 text-sm leading-relaxed text-blue-50"
            style={{ animationDelay: `${i * CASCADE_DELAY_MS}ms` }}
          >
            {h.text}
          </div>
        ))}

        {!loading && visibleHints.length > 0 && (
          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={handleRevealMore}
              disabled={!canRevealMore}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-700/50 bg-blue-950/40 px-3 py-1 text-xs font-bold text-blue-200 transition hover:border-blue-500 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Lightbulb className="h-3 w-3" />
              {canRevealMore ? "Je veux un autre indice" : "Plus d'indices disponibles"}
            </button>
            <button
              onClick={onOpenTheory}
              disabled={!theoryPage || theoryLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-700/50 bg-blue-950/40 px-3 py-1 text-xs font-bold text-blue-200 transition hover:border-blue-500 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <BookOpen className="h-3 w-3" />
              {theoryLoading ? "Chargement…" : theoryPage ? `Revoir la théorie` : "Théorie indisponible"}
            </button>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={() => setFeedback("up")}
                aria-pressed={feedback === "up"}
                aria-label="Indice utile"
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full border transition " +
                  (feedback === "up"
                    ? "border-green-500/60 bg-green-500/20 text-green-200"
                    : "border-blue-700/50 text-blue-300 hover:border-blue-500 hover:text-blue-100")
                }
              >
                <ThumbsUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => setFeedback("down")}
                aria-pressed={feedback === "down"}
                aria-label="Indice pas utile"
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full border transition " +
                  (feedback === "down"
                    ? "border-red-500/60 bg-red-500/20 text-red-200"
                    : "border-blue-700/50 text-blue-300 hover:border-blue-500 hover:text-blue-100")
                }
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
