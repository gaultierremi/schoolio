// Render server-rendered MathML safely. Input from KaTeX (lib/katex-render.ts)
// which produces valid HTML5 MathML. Safe to inject via dangerouslySetInnerHTML
// since the input is generated server-side from validated LaTeX.
export function FormulaRenderer({ mathml, className }: { mathml: string; className?: string }) {
  if (!mathml) return null;
  return (
    <div
      className={className ?? "my-2 text-center text-lg"}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: mathml }}
    />
  );
}
