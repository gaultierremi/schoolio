import { BLANK_FORM } from "../_types";

export function QuestionPreview({ form }: { form: typeof BLANK_FORM }) {
  const isTrueFalse = form.type === "truefalse";
  const options = isTrueFalse ? ["Vrai", "Faux"] : form.options;

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-950 p-4">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
        Aperçu élève
      </p>
      <p className="min-h-[2rem] font-bold leading-snug text-white">
        {form.question ? (
          form.question
        ) : (
          <span className="italic text-gray-600">La question apparaîtra ici…</span>
        )}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {options.map((opt, i) => (
          <div
            key={i}
            className={`rounded-xl px-3 py-2.5 text-center text-sm font-bold transition ${
              i === form.answer_index
                ? "border border-green-500/40 bg-green-500/10 text-green-300"
                : "border border-gray-700 bg-gray-900 text-gray-400"
            }`}
          >
            {opt || (!isTrueFalse ? `Option ${String.fromCharCode(65 + i)}` : "")}
          </div>
        ))}
      </div>
      {form.explanation && (
        <p className="mt-3 rounded-xl bg-gray-900 px-3 py-2 text-xs italic text-gray-500">
          💡 {form.explanation}
        </p>
      )}
    </div>
  );
}
