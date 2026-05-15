import katex from "katex";

/**
 * Render LaTeX -> MathML string server-side.
 * Returns "" on empty/invalid input (caller can fallback to image alt-text).
 *
 * Output is HTML5 native MathML — screen-reader accessible (WCAG 2.2 AA).
 * Browsers render MathML natively without JS.
 */
export function latexToMathML(latex: string): string {
  if (!latex || typeof latex !== "string") return "";
  try {
    return katex.renderToString(latex, {
      output: "mathml",
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    return "";
  }
}
