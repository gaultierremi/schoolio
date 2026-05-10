"use client";

/**
 * // Page de recap de fin de cours :
 * // <SessionRecapHero
 * //   courseTitle="Acides et bases"
 * //   className="4e B"
 * //   durationMinutes={52}
 * //   presentCount={24}
 * //   totalCount={27}
 * //   pagesCovered={{ from: 12, to: 18, total: 42 }}
 * // />
 */
export type SessionRecapHeroProps = {
  courseTitle: string;
  className: string;
  durationMinutes: number;
  presentCount: number;
  totalCount: number;
  pagesCovered: {
    from: number;
    to: number;
    total: number;
  };
};

type Kpi = {
  value: string;
  label: string;
};

function formatDuration(durationMinutes: number) {
  const safeDuration = Math.max(0, Math.round(durationMinutes));
  return `${safeDuration} min`;
}

function formatAttendance(presentCount: number, totalCount: number) {
  const safePresentCount = Math.max(0, Math.round(presentCount));
  const safeTotalCount = Math.max(0, Math.round(totalCount));
  return `${safePresentCount}/${safeTotalCount}`;
}

function formatPagesCovered(pagesCovered: SessionRecapHeroProps["pagesCovered"]) {
  const from = Math.max(1, Math.round(pagesCovered.from));
  const to = Math.max(from, Math.round(pagesCovered.to));
  return `p.${from}→${to}`;
}

export function SessionRecapHero({
  courseTitle,
  className,
  durationMinutes,
  presentCount,
  totalCount,
  pagesCovered,
}: SessionRecapHeroProps) {
  const kpis: Kpi[] = [
    {
      value: formatDuration(durationMinutes),
      label: "Durée",
    },
    {
      value: formatAttendance(presentCount, totalCount),
      label: "Présence",
    },
    {
      value: formatPagesCovered(pagesCovered),
      label: "Pages couvertes",
    },
  ];

  return (
    <section
      className="animate-[session-recap-hero-in_400ms_ease-out_both] rounded-xl border border-purple-800/30 bg-gradient-to-br from-purple-900/30 via-gray-900 to-gray-950 p-6 shadow-xl shadow-black/10 md:p-8"
      aria-labelledby="session-recap-hero-title"
    >
      <style jsx>{`
        @keyframes session-recap-hero-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <p className="text-xs font-semibold uppercase tracking-wide text-purple-400">Cours terminé</p>
      <h1 id="session-recap-hero-title" className="mt-2 text-2xl font-semibold text-white md:text-3xl">
        {courseTitle}
      </h1>
      <p className="mt-1 text-sm text-gray-400">{className}</p>

      <div className="my-4 border-t border-gray-800" />

      <dl className="grid grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-0 text-center">
            <dt className="mt-1 text-xs font-medium uppercase text-gray-500">{kpi.label}</dt>
            <dd className="truncate text-xl font-semibold text-white md:text-2xl">{kpi.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default SessionRecapHero;
