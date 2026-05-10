/**
 * // Carte élève avec progression :
 * // <CourseProgressCard
 * //   title="Acides et bases"
 * //   subjectEnum="chimie"
 * //   level="4e"
 * //   pdfPages={18}
 * //   progressPercent={64}
 * //   lastActivityDate={new Date()}
 * //   variant="student"
 * //   onClick={() => openCourse("course-123")}
 * // />
 *
 * // Carte prof avec métriques de classe :
 * // <CourseProgressCard
 * //   title="Fonctions affines"
 * //   subjectEnum="maths"
 * //   level="5e"
 * //   pdfPages={24}
 * //   studentCount={28}
 * //   variant="teacher"
 * //   onClick={() => openCourse("course-456")}
 * // />
 */
export type CourseProgressCardProps = {
  title: string;
  subjectEnum: string;
  level: string;
  pdfPages: number;
  progressPercent?: number;
  lastActivityDate?: Date;
  variant: "student" | "teacher";
  onClick: () => void;
  studentCount?: number;
  className?: string;
};

type SubjectTheme = {
  icon: string;
  label: string;
  iconClasses: string;
  progressClasses: string;
};

const subjectThemes: Record<string, SubjectTheme> = {
  chimie: {
    icon: "⚗️",
    label: "Chimie",
    iconClasses: "bg-purple-500/15 text-purple-300 ring-purple-500/30",
    progressClasses: "bg-purple-500",
  },
  chemistry: {
    icon: "⚗️",
    label: "Chimie",
    iconClasses: "bg-purple-500/15 text-purple-300 ring-purple-500/30",
    progressClasses: "bg-purple-500",
  },
  maths: {
    icon: "∑",
    label: "Maths",
    iconClasses: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
    progressClasses: "bg-blue-500",
  },
  math: {
    icon: "∑",
    label: "Maths",
    iconClasses: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
    progressClasses: "bg-blue-500",
  },
  bio: {
    icon: "🧬",
    label: "Bio",
    iconClasses: "bg-green-500/15 text-green-300 ring-green-500/30",
    progressClasses: "bg-green-500",
  },
  biology: {
    icon: "🧬",
    label: "Bio",
    iconClasses: "bg-green-500/15 text-green-300 ring-green-500/30",
    progressClasses: "bg-green-500",
  },
};

const defaultTheme: SubjectTheme = {
  icon: "📘",
  label: "Cours",
  iconClasses: "bg-gray-800 text-gray-300 ring-gray-700",
  progressClasses: "bg-purple-500",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampPercent(progressPercent?: number) {
  if (!Number.isFinite(progressPercent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(progressPercent ?? 0)));
}

function getSubjectTheme(subjectEnum: string) {
  return subjectThemes[subjectEnum.trim().toLowerCase()] ?? defaultTheme;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-BE", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function pluralizePages(pdfPages: number) {
  return `${pdfPages} page${pdfPages > 1 ? "s" : ""}`;
}

function pluralizeStudents(studentCount: number) {
  return `${studentCount} élève${studentCount > 1 ? "s" : ""}`;
}

export function CourseProgressCard({
  title,
  subjectEnum,
  level,
  pdfPages,
  progressPercent,
  lastActivityDate,
  variant,
  onClick,
  studentCount,
  className,
}: CourseProgressCardProps) {
  const theme = getSubjectTheme(subjectEnum);
  const progress = clampPercent(progressPercent);
  const safePdfPages = Math.max(0, Math.floor(pdfPages));
  const safeStudentCount =
    typeof studentCount === "number" && Number.isFinite(studentCount)
      ? Math.max(0, Math.floor(studentCount))
      : null;

  return (
    <button
      aria-label={`Ouvrir le cours ${title}`}
      className={cx(
        "group w-full cursor-pointer rounded-xl border border-gray-800 bg-gray-900 p-4 text-left transition-all duration-150 hover:border-purple-500/40 hover:bg-gray-900/90 hover:shadow-lg hover:shadow-purple-950/20 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950 active:scale-[0.99]",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl font-bold ring-1",
            theme.iconClasses,
          )}
        >
          {theme.icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-base font-bold text-white">
                {title}
              </span>
              <span className="mt-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                {theme.label} · {level}
              </span>
            </span>
            <span className="shrink-0 rounded-lg border border-gray-800 bg-gray-950/60 px-2 py-1 text-xs font-semibold text-gray-400">
              {pluralizePages(safePdfPages)}
            </span>
          </span>

          {variant === "student" ? (
            <span className="mt-4 block">
              <span className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500">Progression</span>
                <span className="text-xs font-semibold tabular-nums text-gray-300">
                  {progress}%
                </span>
              </span>
              <span className="block h-2 overflow-hidden rounded-full bg-gray-800">
                <span
                  className={cx(
                    "block h-full rounded-full transition-all duration-300",
                    theme.progressClasses,
                  )}
                  style={{ width: `${progress}%` }}
                />
              </span>
              {lastActivityDate ? (
                <span className="mt-2 block text-xs text-gray-500">
                  Dernière activité · {formatDate(lastActivityDate)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="mt-4 grid grid-cols-2 gap-2">
              <span className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
                <span className="block text-lg font-bold tabular-nums text-white">
                  {safePdfPages}
                </span>
                <span className="text-xs text-gray-500">pages PDF</span>
              </span>
              <span className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
                <span className="block text-lg font-bold tabular-nums text-white">
                  {safeStudentCount ?? "—"}
                </span>
                <span className="text-xs text-gray-500">
                  {safeStudentCount === null
                    ? "élèves"
                    : pluralizeStudents(safeStudentCount).replace(/^\d+\s/, "")}
                </span>
              </span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default CourseProgressCard;
