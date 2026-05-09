import type { ConceptMastery } from "@/lib/concepts";

function MasteryBar({ score }: { score: number }) {
  const color =
    score < 30 ? "bg-red-500" : score < 60 ? "bg-orange-500" : "bg-green-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

export default function MasteryDashboard({
  mastery,
}: {
  mastery: ConceptMastery[];
}) {
  if (mastery.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center text-sm text-gray-500">
        Joue en mode quiz pour suivre ta maîtrise des concepts historiques.
      </div>
    );
  }

  const now = new Date();

  const strong = mastery
    .filter((m) => m.mastery_score >= 60)
    .sort((a, b) => b.mastery_score - a.mastery_score);

  const weak = mastery
    .filter((m) => m.mastery_score < 60)
    .sort((a, b) => a.mastery_score - b.mastery_score);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="mb-4 text-lg font-black text-white">
          Maîtrise par concept
        </h3>
        <div className="flex flex-col gap-4">
          {mastery.map((m) => {
            const needsReview = new Date(m.next_review) <= now;
            return (
              <div key={m.concept_id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-300">
                    {m.concept.name}
                    {needsReview && (
                      <span className="ml-2 rounded-full bg-amber-900/30 px-2 py-0.5 text-xs font-bold text-amber-400">
                        À revoir
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      m.mastery_score < 30
                        ? "text-red-500"
                        : m.mastery_score < 60
                          ? "text-orange-500"
                          : "text-green-500"
                    }`}
                  >
                    {m.mastery_score}/100
                  </span>
                </div>
                <MasteryBar score={m.mastery_score} />
                <p className="text-xs text-gray-600">
                  {m.attempts} tentative{m.attempts > 1 ? "s" : ""} ·{" "}
                  {m.correct} correcte{m.correct > 1 ? "s" : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {strong.length > 0 && (
          <div className="rounded-2xl border border-green-800/30 bg-green-950/20 p-4">
            <h4 className="mb-3 text-sm font-black text-green-400">
              ✓ Tes points forts
            </h4>
            <ul className="flex flex-col gap-2">
              {strong.slice(0, 5).map((m) => (
                <li
                  key={m.concept_id}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-green-400">
                    {m.concept.name}
                  </span>
                  <span className="text-xs font-bold text-green-500">
                    {m.mastery_score}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {weak.length > 0 && (
          <div className="rounded-2xl border border-red-800/30 bg-red-950/20 p-4">
            <h4 className="mb-3 text-sm font-black text-red-400">
              ↑ Tes points faibles
            </h4>
            <ul className="flex flex-col gap-2">
              {weak.slice(0, 5).map((m) => (
                <li
                  key={m.concept_id}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-red-400">
                    {m.concept.name}
                  </span>
                  <span className="text-xs font-bold text-red-500">
                    {m.mastery_score}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
