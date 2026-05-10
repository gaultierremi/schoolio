/**
 * // Dashboard élève :
 * // <WeeklyStatsBanner
 * //   assignmentsCompleted={3}
 * //   questionsPracticed={42}
 * //   liveParticipations={5}
 * //   avgGradeLetter="B"
 * // />
 */
export type WeeklyStatsBannerProps = {
  assignmentsCompleted: number;
  questionsPracticed: number;
  liveParticipations: number;
  avgGradeLetter: "A" | "B" | "C" | "D" | null;
  className?: string;
};

type StatChip = {
  icon: string;
  value: string;
  label: string;
  isEmpty: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeCount(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function StatChip({ icon, value, label, isEmpty }: StatChip) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2",
        isEmpty && "opacity-60",
      )}
    >
      <span aria-hidden="true" className="shrink-0 text-base text-gray-400">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tabular-nums text-gray-200">
          {value}
        </span>
        <span className="block truncate text-xs text-gray-500">{label}</span>
      </span>
    </div>
  );
}

export function WeeklyStatsBanner({
  assignmentsCompleted,
  questionsPracticed,
  liveParticipations,
  avgGradeLetter,
  className,
}: WeeklyStatsBannerProps) {
  const completed = normalizeCount(assignmentsCompleted);
  const practiced = normalizeCount(questionsPracticed);
  const participations = normalizeCount(liveParticipations);

  const stats: StatChip[] = [
    {
      icon: "✓",
      value: String(completed),
      label: "devoirs",
      isEmpty: completed === 0,
    },
    {
      icon: "❓",
      value: String(practiced),
      label: "questions",
      isEmpty: practiced === 0,
    },
    {
      icon: "☝",
      value: String(participations),
      label: "participations",
      isEmpty: participations === 0,
    },
    {
      icon: "Ø",
      value: avgGradeLetter ?? "—",
      label: "Note moy.",
      isEmpty: avgGradeLetter === null,
    },
  ];

  return (
    <section
      aria-label="Statistiques de la semaine"
      className={cx(
        "rounded-xl border border-gray-800 bg-gray-900 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap gap-2 md:flex-nowrap">
        {stats.map((stat) => (
          <StatChip
            icon={stat.icon}
            isEmpty={stat.isEmpty}
            key={stat.label}
            label={stat.label}
            value={stat.value}
          />
        ))}
      </div>
    </section>
  );
}

export default WeeklyStatsBanner;
