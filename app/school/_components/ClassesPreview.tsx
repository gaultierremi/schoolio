"use client";
import Link from "next/link";

type ClassPreview = {
  id: string;
  name: string;
  level: number | null;
  subject: string | null;
  member_count: number;
};

const LEVEL_SHORT: Record<number, string> = {
  1: "1ère", 2: "2ème", 3: "3ème", 4: "4ème", 5: "5ème", 6: "6ème",
};

export default function ClassesPreview({
  classes,
  loading,
}: {
  classes?: ClassPreview[];
  loading: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">
          Classes récentes
        </h2>
        <Link
          href="/school/classes"
          className="text-xs font-bold text-gray-500 transition hover:text-purple-400"
        >
          Voir tout →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-800" />
          ))}
        </div>
      ) : !classes || classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 p-8 text-center text-sm text-gray-600">
          Aucune classe créée.{" "}
          <Link
            href="/school/classes/new"
            className="text-purple-400 hover:text-purple-300"
          >
            Créer une classe →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {classes.map((cls) => (
            <Link
              key={cls.id}
              href={`/school/classes/${cls.id}`}
              className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 transition-all hover:border-purple-500/50 hover:bg-gray-800/80"
            >
              <div>
                <p className="font-bold text-white">{cls.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {cls.level !== null
                    ? (LEVEL_SHORT[cls.level] ?? `${cls.level}ème`)
                    : null}
                  {cls.level !== null && cls.subject ? " · " : null}
                  {cls.subject}
                </p>
              </div>
              <div className="ml-4 shrink-0 text-right">
                <p className="text-sm font-bold text-white">{cls.member_count}</p>
                <p className="text-xs text-gray-600">
                  élève{cls.member_count !== 1 ? "s" : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
