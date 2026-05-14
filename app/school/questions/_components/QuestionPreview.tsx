import { BLANK_FORM } from "../_types";

export function QuestionPreview({ form }: { form: typeof BLANK_FORM }) {
  const isTrueFalse = form.type === "truefalse";
  const options = isTrueFalse ? ["Vrai", "Faux"] : form.options;

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
        Aperçu élève
      </p>
      <p className="min-h-[2rem] font-bold leading-snug text-[rgb(var(--ink))]">
        {form.question ? (
          form.question
        ) : (
          <span className="italic text-[rgb(var(--ink-3))]">La question apparaîtra ici…</span>
        )}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {options.map((opt, i) => (
          <div
            key={i}
            className={`rounded-xl px-3 py-2.5 text-center text-sm font-bold transition ${
              i === form.answer_index
                ? "border border-[rgb(var(--green))]/40 bg-[rgb(var(--green))]/10 text-[rgb(var(--green))]"
                : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))]"
            }`}
          >
            {opt || (!isTrueFalse ? `Option ${String.fromCharCode(65 + i)}` : "")}
          </div>
        ))}
      </div>
      {form.explanation && (
        <p className="mt-3 rounded-xl bg-[rgb(var(--surface))] px-3 py-2 text-xs italic text-[rgb(var(--ink-2))]">
          💡 {form.explanation}
        </p>
      )}
    </div>
  );
}
