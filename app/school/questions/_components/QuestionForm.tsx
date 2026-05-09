import { BLANK_FORM, PERIODS } from "../_types";
import { SubjectLevelSelector } from "./SubjectLevelSelector";
import { QuestionPreview } from "./QuestionPreview";

export function QuestionForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  isEdit,
  generatingExpl,
  onGenerateExpl,
}: {
  form: typeof BLANK_FORM;
  setForm: (f: typeof BLANK_FORM) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit: boolean;
  generatingExpl: boolean;
  onGenerateExpl: () => void;
}) {
  const isTrueFalse = form.type === "truefalse";
  const displayOptions = isTrueFalse ? ["Vrai", "Faux"] : form.options;

  const isValid =
    form.question.trim().length > 0 &&
    (form.type === "truefalse" ||
      form.options.filter((o) => o.trim()).length >= 2);

  return (
    <div className="mb-6 rounded-3xl border border-purple-500/30 bg-gray-900 p-5">
      <h2 className="text-lg font-black text-white">
        {isEdit ? "Modifier la question" : "Nouvelle question"}
      </h2>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* Left: form fields */}
        <div className="space-y-4">
          {/* Row 1: type + period */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500">
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    type: e.target.value as "mcq" | "truefalse",
                    answer_index: 0,
                  })
                }
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-purple-500"
              >
                <option value="mcq">QCM — Carré (4 options)</option>
                <option value="truefalse">Vrai / Faux — Duo (2 options)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500">
                Période historique
              </label>
              <select
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-purple-500"
              >
                <option value="">Sélectionner une période</option>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject + Level */}
          <SubjectLevelSelector
            subjectId={form.subjectId}
            level={form.level}
            onSubjectChange={(id) => {
              if (id) setForm({ ...form, subjectId: id });
            }}
            onLevelChange={(l) => setForm({ ...form, level: l })}
          />

          {/* Question text */}
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-gray-500">
              Question
            </label>
            <textarea
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              rows={2}
              placeholder="Énonce ta question..."
              className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none placeholder:text-gray-600 focus:border-purple-500"
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-gray-500">
              {isTrueFalse
                ? "Réponse correcte"
                : "Options — clique sur le cercle pour marquer la bonne réponse"}
            </label>
            <div
              className={`mt-2 grid gap-2 ${
                isTrueFalse ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {displayOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, answer_index: i })}
                    className={`shrink-0 h-6 w-6 rounded-full border-2 transition ${
                      form.answer_index === i
                        ? "border-green-500 bg-green-500"
                        : "border-gray-600 hover:border-gray-400"
                    }`}
                    aria-label={`Marquer option ${i + 1} comme correcte`}
                  />
                  {isTrueFalse ? (
                    <span
                      className={`font-bold ${
                        form.answer_index === i ? "text-green-300" : "text-white"
                      }`}
                    >
                      {opt}
                    </span>
                  ) : (
                    <input
                      value={form.options[i] ?? ""}
                      onChange={(e) => {
                        const next = [...form.options];
                        next[i] = e.target.value;
                        setForm({ ...form, options: next });
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      className={`w-full rounded-xl border px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-purple-500 ${
                        form.answer_index === i
                          ? "border-green-500/50 bg-green-500/10"
                          : "border-gray-700 bg-gray-950"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Explanation + AI button */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-widest text-gray-500">
                Explication (optionnel)
              </label>
              <button
                type="button"
                onClick={onGenerateExpl}
                disabled={generatingExpl || !form.question.trim()}
                className="rounded-lg bg-purple-500/20 px-3 py-1 text-xs font-black text-purple-300 transition hover:bg-purple-500/30 disabled:opacity-40"
              >
                {generatingExpl ? "Génération…" : "✨ Générer via IA"}
              </button>
            </div>
            <input
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              placeholder="Explication affichée après la réponse..."
              className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none placeholder:text-gray-600 focus:border-purple-500"
            />
          </div>
        </div>

        {/* Right: preview (desktop) */}
        <div className="hidden lg:block">
          <QuestionPreview form={form} />
        </div>
      </div>

      {/* Preview mobile */}
      <div className="mt-4 lg:hidden">
        <QuestionPreview form={form} />
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !isValid}
          title={
            !isValid
              ? "Complète la question et sélectionne une bonne réponse"
              : undefined
          }
          className="rounded-2xl bg-purple-500 px-5 py-3 font-black text-gray-950 hover:bg-purple-400 disabled:opacity-40"
        >
          {saving ? "Sauvegarde..." : isEdit ? "Enregistrer" : "Ajouter"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl border border-gray-700 px-5 py-3 font-bold text-gray-300 hover:text-white"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
