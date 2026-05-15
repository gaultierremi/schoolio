import { BLANK_FORM, type QuestionType } from "../_types";
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
  const isMcq = form.type === "mcq";
  const isNumeric = form.type === "numeric";
  const isShortText = form.type === "short_text";
  const displayOptions = isTrueFalse ? ["Vrai", "Faux"] : form.options;

  // Validation par type — l'enregistrement n'est autorisé que si les champs
  // pertinents pour le type sont remplis.
  const numericValid =
    isNumeric &&
    form.expected_numeric_answer.trim().length > 0 &&
    Number.isFinite(Number(form.expected_numeric_answer));
  const shortTextValid =
    isShortText &&
    form.expected_text_answers.filter((a) => a.trim().length > 0).length >= 1;
  const mcqValid =
    isMcq && form.options.filter((o) => o.trim()).length >= 2;
  const trueFalseValid = isTrueFalse;

  const isValid =
    form.question.trim().length > 0 &&
    (mcqValid || trueFalseValid || numericValid || shortTextValid);

  return (
    <div className="mb-6 rounded-3xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--surface))] p-5">
      <h2 className="serif text-lg font-black text-[rgb(var(--ink))]">
        {isEdit ? "Modifier la question" : "Nouvelle question"}
      </h2>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* Left: form fields */}
        <div className="space-y-4">
          {/* Row 1: type
              Note : le champ "period" est conservé en state (preservé sur edit
              depuis la question existante, écrit en DB par le pipeline syllabus
              comme nom de chapitre) mais n'est plus éditable par le prof.
              Cf. PR ux/sidebar-and-form-cleanup pour le rationale. */}
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) => {
                const nextType = e.target.value as QuestionType;
                setForm({
                  ...form,
                  type: nextType,
                  answer_index: 0,
                });
              }}
              className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
            >
              <option value="mcq">QCM — Carré (4 options)</option>
              <option value="numeric">Numérique — Réponse chiffrée</option>
              <option value="short_text">Réponse libre — 1-5 variantes</option>
              <option value="truefalse">Vrai / Faux — Duo (2 options)</option>
            </select>
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
            <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
              Question
            </label>
            <textarea
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              rows={2}
              placeholder="Énonce ta question..."
              className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
            />
          </div>

          {/* Rendu spécifique par type */}
          {(isMcq || isTrueFalse) && (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
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
                      className={`h-6 w-6 shrink-0 rounded-full border-2 transition ${
                        form.answer_index === i
                          ? "border-[rgb(var(--green))] bg-[rgb(var(--green))]"
                          : "border-[rgb(var(--border))] hover:border-[rgb(var(--ink-3))]"
                      }`}
                      aria-label={`Marquer option ${i + 1} comme correcte`}
                    />
                    {isTrueFalse ? (
                      <span
                        className={`font-bold ${
                          form.answer_index === i ? "text-[rgb(var(--green))]" : "text-[rgb(var(--ink))]"
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
                        className={`w-full rounded-xl border px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))] ${
                          form.answer_index === i
                            ? "border-[rgb(var(--green))]/50 bg-[rgb(var(--green))]/10"
                            : "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isNumeric && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                  Réponse attendue (nombre)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.expected_numeric_answer}
                  onChange={(e) =>
                    setForm({ ...form, expected_numeric_answer: e.target.value })
                  }
                  placeholder="Ex : 7"
                  className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                    Tolérance ± (optionnel, défaut 0.01)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.numeric_tolerance}
                    onChange={(e) =>
                      setForm({ ...form, numeric_tolerance: e.target.value })
                    }
                    placeholder="0.01"
                    className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                    Unité (optionnel)
                  </label>
                  <input
                    type="text"
                    value={form.numeric_unit}
                    onChange={(e) =>
                      setForm({ ...form, numeric_unit: e.target.value })
                    }
                    placeholder="Ex : atomes, g, mol/L"
                    className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
                  />
                </div>
              </div>
            </div>
          )}

          {isShortText && (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                Réponses acceptables (1-5 variantes orthographiques)
              </label>
              <div className="mt-2 space-y-2">
                {form.expected_text_answers.map((ans, i) => (
                  <input
                    key={i}
                    value={ans}
                    onChange={(e) => {
                      const next = [...form.expected_text_answers];
                      next[i] = e.target.value;
                      setForm({ ...form, expected_text_answers: next });
                    }}
                    placeholder={
                      i === 0
                        ? "Réponse principale"
                        : `Variante ${i + 1} (optionnel)`
                    }
                    className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-[rgb(var(--ink-3))]">
                Comparaison après normalisation (minuscules, sans accents).
              </p>
            </div>
          )}

          {/* Explanation + AI button */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                Explication (optionnel)
              </label>
              <button
                type="button"
                onClick={onGenerateExpl}
                disabled={generatingExpl || !form.question.trim()}
                className="rounded-lg bg-[rgb(var(--accent))]/15 px-3 py-1 text-xs font-black text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent))]/25 disabled:opacity-40"
              >
                {generatingExpl ? "Génération…" : "Générer via Maïa"}
              </button>
            </div>
            <input
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              placeholder="Explication affichée après la réponse..."
              className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
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
              ? "Complète la question et les champs spécifiques à ce type."
              : undefined
          }
          className="rounded-2xl bg-[rgb(var(--accent))] px-5 py-3 font-black text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Sauvegarde..." : isEdit ? "Enregistrer" : "Ajouter"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl border border-[rgb(var(--border))] px-5 py-3 font-bold text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
