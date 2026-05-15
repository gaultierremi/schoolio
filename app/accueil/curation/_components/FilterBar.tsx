import { PERIODS } from "../_types";

export function FilterBar({
  filterType,
  setFilterType,
  filterPeriod,
  setFilterPeriod,
  filterText,
  setFilterText,
  showText = false,
  filterOrigin,
  setFilterOrigin,
}: {
  filterType: string;
  setFilterType: (v: string) => void;
  filterPeriod: string;
  setFilterPeriod: (v: string) => void;
  filterText?: string;
  setFilterText?: (v: string) => void;
  showText?: boolean;
  filterOrigin?: string;
  setFilterOrigin?: (v: "" | "ai_generated" | "extracted_from_pdf") => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {showText && setFilterText !== undefined && (
        <input
          type="text"
          value={filterText ?? ""}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Rechercher..."
          className="min-w-[160px] flex-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
        />
      )}
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
      >
        <option value="">Tous les types</option>
        <option value="mcq">QCM</option>
        <option value="numeric">Numérique</option>
        <option value="short_text">Réponse libre</option>
        <option value="truefalse">Vrai / Faux</option>
      </select>
      <select
        value={filterPeriod}
        onChange={(e) => setFilterPeriod(e.target.value)}
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
      >
        <option value="">Toutes les périodes</option>
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {setFilterOrigin !== undefined && (
        <select
          value={filterOrigin ?? ""}
          onChange={(e) => setFilterOrigin(e.target.value as "" | "ai_generated" | "extracted_from_pdf")}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
        >
          <option value="">Toutes les origines</option>
          <option value="ai_generated">Maïa</option>
          <option value="extracted_from_pdf">📄 PDF</option>
        </select>
      )}
    </div>
  );
}
