import {
  SUBJECTS,
  SUBJECTS_BY_ID,
  LEVELS,
  type SubjectId,
  type SchoolLevel,
} from "@/lib/subjects";

const QUICK_SUBJECTS = ["chimie", "physique", "biologie", "histoire"] as const;

const QUICK_ACTIVE_STYLE: Record<string, string> = {
  chimie:   "border-blue-400 bg-blue-100 text-blue-700",
  physique: "border-cyan-400 bg-cyan-100 text-cyan-700",
  biologie: "border-green-400 bg-green-100 text-green-700",
  histoire: "border-amber-400 bg-amber-100 text-amber-800",
};

export function SubjectLevelSelector({
  subjectId,
  level,
  onSubjectChange,
  onLevelChange,
  allowAllSubjects = false,
}: {
  subjectId: SubjectId | null;
  level: SchoolLevel | null;
  onSubjectChange: (id: SubjectId | null) => void;
  onLevelChange: (level: SchoolLevel | null) => void;
  allowAllSubjects?: boolean;
}) {
  const isQuick =
    subjectId !== null && (QUICK_SUBJECTS as readonly string[]).includes(subjectId);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
          Matière
        </p>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_SUBJECTS.map((id) => {
            const meta = SUBJECTS_BY_ID[id];
            const isActive = subjectId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSubjectChange(id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-bold transition ${
                  isActive
                    ? QUICK_ACTIVE_STYLE[id]
                    : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                }`}
              >
                <span className="text-lg leading-none">{meta.emoji}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
        <select
          value={subjectId === null ? "__all" : isQuick ? "" : subjectId}
          onChange={(e) => {
            if (e.target.value === "__all") {
              onSubjectChange(null);
            } else if (e.target.value) {
              onSubjectChange(e.target.value as SubjectId);
            }
          }}
          className="mt-2 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
        >
          {allowAllSubjects && <option value="__all">Toutes les matières</option>}
          <option value="">Autre matière…</option>
          {SUBJECTS.filter(
            (s) => !(QUICK_SUBJECTS as readonly string[]).includes(s.id)
          ).map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
          Niveau
        </p>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onLevelChange(l.id)}
              className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                level === l.id
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]"
                  : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              }`}
            >
              {l.shortLabel}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onLevelChange(null)}
            className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
              level === null
                ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]"
                : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
            }`}
          >
            Tous
          </button>
        </div>
      </div>
    </div>
  );
}
