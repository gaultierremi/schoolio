"use client";

type StudentClassCardProps = {
  className: string;
  teacherName: string;
  level?: string | null;
  subject?: string | null;
  joinedAt: string;
  pseudo?: string | null;
  onLeave: () => void;
  loading?: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function StudentClassCard({
  className,
  teacherName,
  level,
  subject,
  joinedAt,
  pseudo,
  onLeave,
  loading = false,
}: StudentClassCardProps) {
  const joinedDate = new Date(joinedAt);
  const formattedJoinedDate = dateFormatter.format(joinedDate);
  const badges = [level, subject].filter(
    (badge): badge is string => Boolean(badge?.trim()),
  );

  return (
    <article className="w-full max-w-[480px] rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-200/80 sm:p-6">
      <div className="space-y-4">
        <header>
          <h2 className="text-xl font-semibold text-gray-950">{className}</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Avec {teacherName}
          </p>

          {badges.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <div className="space-y-2 text-sm text-gray-600">
          <p>
            Tu as rejoint le{" "}
            <time dateTime={joinedAt}>{formattedJoinedDate}</time>
          </p>

          {pseudo ? (
            <p className="italic text-gray-500">
              Connecté en tant que {pseudo}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={loading}
            aria-label={`Quitter la classe ${className}`}
            onClick={onLeave}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "..." : "Quitter"}
          </button>
        </div>
      </div>
    </article>
  );
}

export type { StudentClassCardProps };
