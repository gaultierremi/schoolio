export type HintKind = "validation" | "guided_question" | "encouragement" | "strong_hint";

export type HintRow = {
  id: string;
  question_id: string;
  ordinal: number;
  template: string;
  kind: HintKind;
};

export type RenderedHint = {
  id: string;
  ordinal: number;
  text: string;
  kind: HintKind;
};

export type RenderContext = {
  /** What the student answered (text of their selected option, or raw text input). */
  wrongAnswer: string;
};

/**
 * Substitute slots in a hint template with the runtime context.
 *
 * Supported slots :
 *   {wrong_answer} → ctx.wrongAnswer
 *
 * Spec MVP : "0-IA-runtime" — la résolution des slots est PUREMENT
 * synchrone et déterministe. Aucun appel Claude ne doit avoir lieu ici.
 * Si on ajoute des slots dynamiques (concept_name, formula, etc.), ils
 * doivent être passés via ctx, jamais résolus en appelant un LLM.
 *
 * Sécurité : on tronque wrongAnswer à 200 ch. pour éviter qu'un élève
 * malicieux injecte 4000 ch. dans une bulle de tuteur (rendu UI casse).
 */
export function renderHintTemplate(template: string, ctx: RenderContext): string {
  const wrong = (ctx.wrongAnswer ?? "").slice(0, 200);
  return template.replace(/\{wrong_answer\}/g, wrong);
}

/**
 * Take all approved hints for a question + runtime context, return them
 * rendered + sorted by ordinal. Caller decides how many to "reveal" at
 * once (cascade animation : 1, 2, 3 séquentiel par défaut).
 */
export function renderHints(hints: HintRow[], ctx: RenderContext): RenderedHint[] {
  return hints
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((h) => ({
      id: h.id,
      ordinal: h.ordinal,
      text: renderHintTemplate(h.template, ctx),
      kind: h.kind,
    }));
}
