"use client";

import { CheckCircle2 } from "lucide-react";

export type CorrectionStep = {
  title: string;
  detail?: string | null;
  annotation?: string | null;
};

type Props = {
  steps: CorrectionStep[];
  /** Fallback : rendu quand steps est vide. Texte brut de l'explanation. */
  fallbackExplanation: string | null;
  /** Réponse finale optionnelle à mettre en valeur après les étapes. */
  finalAnswer?: string | null;
};

export function CorrectionPanel({ steps, fallbackExplanation, finalAnswer }: Props) {
  const hasSteps = steps && steps.length > 0;

  if (!hasSteps && !fallbackExplanation) {
    return null; // rien à montrer, ne pas pré-afficher de panel vide
  }

  return (
    <div className="rounded-2xl border-2 border-green-700/40 bg-green-950/10 p-4">
      <header className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          Correction
        </p>
        {hasSteps && (
          <span className="text-xs text-green-400/80">Décompose pas-à-pas</span>
        )}
      </header>

      {hasSteps ? (
        <>
          <ol className="space-y-3">
            {steps.map((step, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-100">{step.title}</p>
                  {step.detail && (
                    <p className="mt-0.5 font-mono text-xs text-green-200/80">
                      {step.detail}
                    </p>
                  )}
                  {step.annotation && (
                    <p className="mt-1 text-xs italic text-amber-300/90">
                      ← {step.annotation}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {finalAnswer && (
            <p className="mt-4 text-sm leading-relaxed text-green-100">
              {finalAnswer}
            </p>
          )}
        </>
      ) : (
        // Fallback : l'explanation TEXTE existante (questions pas encore
        // converties au format steps). UX dégradée mais lisible.
        <p className="text-sm leading-relaxed text-green-100">
          {fallbackExplanation}
        </p>
      )}
    </div>
  );
}
