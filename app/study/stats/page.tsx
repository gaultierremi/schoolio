import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import Header from "@/components/Header";
import { getUserMastery } from "@/lib/concepts";
import { getStudyStats } from "@/lib/study-session";
import { SUBJECTS } from "@/lib/subjects";

export const dynamic = "force-dynamic";

const SUBJECT_COLORS: Record<string, string> = {
  amber:  "bg-amber-500",
  blue:   "bg-blue-500",
  green:  "bg-green-500",
  teal:   "bg-teal-500",
  purple: "bg-purple-500",
  red:    "bg-red-500",
  pink:   "bg-pink-500",
  orange: "bg-orange-500",
  indigo: "bg-indigo-500",
  gray:   "bg-gray-500",
};

export default async function StudyStatsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  let mastery: Awaited<ReturnType<typeof getUserMastery>> = [];
  let stats: Awaited<ReturnType<typeof getStudyStats>> = {
    bySubject: [],
    totalSessions: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    recentSessions: [],
  };

  try {
    mastery = await getUserMastery(user.id);
  } catch {}

  try {
    stats = await getStudyStats(user.id);
  } catch {}

  const masteredCount = mastery.filter((m) => m.mastery_score >= 60).length;
  const toReviewCount = mastery.filter((m) => m.mastery_score < 60).length;
  const globalRate =
    stats.totalAnswered > 0
      ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100)
      : 0;

  const isEmpty = stats.totalSessions === 0 && mastery.length === 0;

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <Header />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/study"
            className="text-sm text-gray-600 transition hover:text-gray-400"
          >
            ← Retour
          </Link>
          <h1 className="text-2xl font-black text-white">Mes statistiques</h1>
        </div>

        {isEmpty ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
            <p className="text-5xl">📊</p>
            <p className="mt-4 text-lg font-black text-white">
              Pas encore de données
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Lance ta première session d&apos;étude pour voir tes statistiques.
            </p>
            <Link
              href="/study"
              className="mt-6 inline-block rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-purple-500"
            >
              Commencer à étudier →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Overview */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Sessions",       value: stats.totalSessions,  icon: "📚" },
                { label: "Réponses",       value: stats.totalAnswered,  icon: "✅" },
                { label: "Maîtrisés",      value: masteredCount,        icon: "🎯" },
                { label: "Taux réussite",  value: `${globalRate}%`,     icon: "📈" },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-center"
                >
                  <p className="text-2xl">{card.icon}</p>
                  <p className="mt-1 text-xl font-black text-white">
                    {card.value}
                  </p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              ))}
            </div>

            {/* Mastery overview */}
            {mastery.length > 0 && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-gray-400">
                  Maîtrise des concepts
                </h2>
                <div className="mb-3 flex gap-5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-4 rounded bg-green-500" />
                    <span className="text-xs text-gray-400">
                      Maîtrisés ({masteredCount})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-4 rounded bg-orange-500" />
                    <span className="text-xs text-gray-400">
                      À revoir ({toReviewCount})
                    </span>
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-gray-700">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{
                      width: `${mastery.length > 0 ? (masteredCount / mastery.length) * 100 : 0}%`,
                    }}
                  />
                </div>

                {toReviewCount > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs text-gray-500">
                      Priorité de révision :
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {mastery
                        .filter((m) => m.mastery_score < 60)
                        .sort((a, b) => a.mastery_score - b.mastery_score)
                        .slice(0, 8)
                        .map((m) => (
                          <span
                            key={m.concept_id}
                            className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-300"
                          >
                            {m.concept.name} · {m.mastery_score}/100
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* By subject */}
            {stats.bySubject.length > 0 && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-gray-400">
                  Par matière
                </h2>
                <div className="flex flex-col gap-4">
                  {stats.bySubject.map((stat) => {
                    const subject = SUBJECTS.find((s) => s.id === stat.subject);
                    const barColor =
                      SUBJECT_COLORS[subject?.color ?? "gray"] ??
                      "bg-purple-500";
                    return (
                      <div key={stat.subject}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{subject?.emoji ?? "📚"}</span>
                            <span className="text-sm font-medium text-gray-300">
                              {subject?.label ?? stat.subject}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {stat.sessionCount} session
                            {stat.sessionCount > 1 ? "s" : ""} ·{" "}
                            {stat.totalAnswered > 0
                              ? `${stat.masteryRate}%`
                              : "–"}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${stat.masteryRate}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent sessions */}
            {stats.recentSessions.length > 0 && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-gray-400">
                  Sessions récentes
                </h2>
                <div className="flex flex-col gap-2">
                  {stats.recentSessions.map((s) => {
                    const subject = SUBJECTS.find(
                      (sub) => sub.id === s.subject
                    );
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-xl bg-gray-800/50 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg leading-none">
                            {subject?.emoji ?? "📚"}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-300">
                              {subject?.label ?? s.subject}
                            </p>
                            <p className="text-xs text-gray-600">
                              {s.source} · {s.question_count} question
                              {s.question_count > 1 ? "s" : ""}
                              {s.mode === "adaptive" ? " · adaptatif" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">
                            {new Date(s.created_at).toLocaleDateString(
                              "fr-FR",
                              { day: "numeric", month: "short" }
                            )}
                          </p>
                          {s.completed_at ? (
                            <span className="text-[10px] text-green-500">
                              Terminée
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-600">
                              En cours
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Link
              href="/study"
              className="block rounded-xl bg-purple-600 py-3 text-center font-black text-white transition hover:bg-purple-500"
            >
              Nouvelle session →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
