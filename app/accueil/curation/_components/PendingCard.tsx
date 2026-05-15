import type { TeacherQuestion } from "../_types";
import { TypeBadge } from "./TypeBadge";
import { DifficultyStarsEditor } from "./DifficultyStarsEditor";
import { Image as ImageIcon, AlertTriangle } from "lucide-react";
import { FormulaRenderer } from "@/app/_components/FormulaRenderer";
import { MoleculeRenderer } from "@/app/_components/MoleculeRenderer";
import { GeoMap } from "@/app/_components/GeoMap";

export function PendingCard({
  q,
  isFading,
  isValidating,
  isRejecting,
  isBusy,
  onDifficultyChange,
  onValidate,
  onReject,
  onEdit,
}: {
  q: TeacherQuestion;
  isFading: boolean;
  isValidating: boolean;
  isRejecting: boolean;
  isBusy: boolean;
  onDifficultyChange?: (newValue: 1 | 2 | 3 | null) => void;
  onValidate: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-opacity duration-200 ${
        isFading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TypeBadge type={q.type} />
        {q.origin === "extracted_from_pdf" ? (
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-black text-cyan-700">
            PDF
          </span>
        ) : (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-black text-indigo-700">
            Maïa
          </span>
        )}
        {q.period && (
          <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">
            {q.period}
          </span>
        )}
        {q.subject_enum && (
          <span className="text-xs text-[rgb(var(--ink-3))]">{q.subject_enum}</span>
        )}
        {q.image_url && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            <ImageIcon className="h-3 w-3" />
            Image
          </span>
        )}
        {q.needs_review && (
          <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
            <AlertTriangle className="h-3 w-3" />
            À vérifier
          </span>
        )}
      </div>

      <p className="font-bold text-[rgb(var(--ink))]">{q.question}</p>

      {q.image_url && (
        <figure className="my-3">
          {q.formula_mathml ? (
            <FormulaRenderer mathml={q.formula_mathml} />
          ) : q.molecule_smiles ? (
            <MoleculeRenderer smiles={q.molecule_smiles} description={q.image_description_md ?? undefined} />
          ) : q.geo_topojson_path ? (
            <GeoMap topojsonPath={q.geo_topojson_path} />
          ) : (
            <img
              src={q.image_url}
              alt={q.image_description_md ?? "Illustration de l'exercice"}
              className="mx-auto max-h-80 rounded-lg border"
            />
          )}
        </figure>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {q.type === "numeric" ? (
          <span className="rounded-lg bg-[rgb(var(--green))]/15 px-2 py-0.5 text-xs font-black text-[rgb(var(--green))]">
            {q.expected_numeric_answer ?? "—"}
            {q.numeric_unit ? ` ${q.numeric_unit}` : ""}
            {q.numeric_tolerance != null
              ? ` (±${q.numeric_tolerance})`
              : ""}
          </span>
        ) : q.type === "short_text" ? (
          (q.expected_text_answers ?? []).map((ans, i) => (
            <span
              key={i}
              className="rounded-lg bg-[rgb(var(--green))]/15 px-2 py-0.5 text-xs font-black text-[rgb(var(--green))]"
            >
              {ans}
            </span>
          ))
        ) : (
          q.options.map((opt, i) => (
            <span
              key={i}
              className={`rounded-lg px-2 py-0.5 text-xs ${
                i === q.answer_index
                  ? "bg-[rgb(var(--green))]/15 font-black text-[rgb(var(--green))]"
                  : "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-2))]"
              }`}
            >
              {opt}
            </span>
          ))
        )}
      </div>

      {q.explanation && (
        <p className="mt-2 text-xs italic text-[rgb(var(--ink-3))]">{q.explanation}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[rgb(var(--border))] pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[rgb(var(--ink-3))]">Difficulté :</span>
          <DifficultyStarsEditor
            questionId={q.id}
            value={q.difficulty_stars}
            onChange={onDifficultyChange}
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onEdit}
            disabled={isBusy}
            className="rounded-xl border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] hover:border-[rgb(var(--accent))]/50 hover:text-[rgb(var(--accent))] disabled:opacity-40"
          >
            Modifier
          </button>
          <button
            onClick={onReject}
            disabled={isBusy}
            className="rounded-xl border border-[rgb(var(--red))]/30 px-3 py-1.5 text-xs font-bold text-[rgb(var(--red))] hover:bg-[rgb(var(--red))]/10 disabled:opacity-40"
          >
            {isRejecting ? "…" : "Rejeter"}
          </button>
          <button
            onClick={onValidate}
            disabled={isBusy}
            className="rounded-xl bg-[rgb(var(--green))] px-4 py-1.5 text-xs font-black text-white hover:opacity-90 disabled:opacity-40"
          >
            {isValidating ? "…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
