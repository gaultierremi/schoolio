import {
  SUBJECTS,
  SUBJECTS_BY_ID,
  LEVELS,
  type SubjectId,
  type SchoolLevel,
} from "@/lib/subjects";

const QUICK_SUBJECTS = ["chimie", "physique", "biologie", "histoire"] as const;

const QUICK_ACTIVE_STYLE: Record<string, string> = {
  chimie:   "border-blue-500 bg-blue-500/10 text-blue-300",
  physique: "border-cyan-500 bg-cyan-500/10 text-cyan-300",
  biologie: "border-green-500 bg-green-500/10 text-green-300",
  histoire: "border-amber-500 bg-amber-500/10 text-amber-300",
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
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">
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
                    : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-white"
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
          className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
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
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">
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
                  ? "border-purple-500 bg-purple-500/10 text-purple-300"
                  : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-white"
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
                ? "border-purple-500 bg-purple-500/10 text-purple-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-white"
            }`}
          >
            Tous
          </button>
        </div>
      </div>
    </div>
  );
}
