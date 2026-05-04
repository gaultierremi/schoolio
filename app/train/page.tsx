import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { getWeakConcepts, getUserMastery } from "@/lib/concepts";
import { getAdaptiveQuestions } from "@/lib/adaptive";
import TrainingCard from "@/components/TrainingCard";
import type { QuizQuestion } from "@/lib/types";
import type { ConceptMastery } from "@/lib/concepts";

export const dynamic = "force-dynamic";

export default async function TrainPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  let hasData = false;
  let weakConcepts: ConceptMastery[] = [];
  let questions: QuizQuestion[] = [];
  let questionConcepts: Record<string, { id: string; name: string }[]> = {};
  let initialMastery: Record<string, number> = {};

  try {
    const mastery = await getUserMastery(user.id);
    hasData = mastery.length > 0;

    for (const m of mastery) {
      initialMastery[m.concept_id] = m.mastery_score;
    }

    weakConcepts = await getWeakConcepts(user.id, 3);
    questions = await getAdaptiveQuestions(user.id, 1, 10);

    if (questions.length > 0) {
      const db = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const qIds = questions.map((q) => q.id);
      const { data: links } = await db
        .from("question_concepts")
        .select("question_id, concept_id, concept:concepts(id, name)")
        .in("question_id", qIds);

      type LinkRow = {
        question_id: string;
        concept_id: string;
        concept: { id: string; name: string };
      };
      for (const link of (links ?? []) as unknown as LinkRow[]) {
        if (!questionConcepts[link.question_id]) {
          questionConcepts[link.question_id] = [];
        }
        if (
          !questionConcepts[link.question_id].some(
            (c) => c.id === link.concept.id
          )
        ) {
          questionConcepts[link.question_id].push(link.concept);
        }
      }
    }
  } catch {
    // Tables not yet created — show first-visit screen
  }

  if (!hasData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 px-4 text-center">
        <div className="flex flex-col items-center gap-4">
          <span className="text-7xl leading-none">🧠</span>
          <h1 className="text-3xl font-black text-white">
            Entraînement adaptatif
          </h1>
          <p className="max-w-md text-base leading-relaxed text-gray-400">
            Ce mode analyse tes lacunes et sélectionne les questions qui te
            feront progresser. Joue quelques parties en mode Quiz pour
            l&apos;activer.
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <Link
            href="/quiz"
            className="rounded-2xl bg-amber-500 px-6 py-4 text-center font-black text-gray-950 transition hover:bg-amber-400 active:scale-[0.98]"
          >
            Jouer au Quiz d&apos;abord →
          </Link>
          <Link
            href="/"
            className="rounded-2xl border border-gray-700 px-6 py-3 text-center text-sm font-bold text-gray-400 transition hover:border-gray-500 hover:text-white"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-6">
        <Link
          href="/"
          className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-400 transition hover:text-white"
        >
          ← Accueil
        </Link>
        <span className="text-sm font-black uppercase tracking-widest text-purple-400">
          🧠 Adaptatif
        </span>
      </div>

      {weakConcepts.length > 0 && (
        <div className="mx-auto mt-4 max-w-2xl px-4">
          <div className="flex flex-wrap gap-2">
            {weakConcepts.map((m) => (
              <span
                key={m.concept_id}
                className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-400"
              >
                {m.concept.name} · {m.mastery_score}/100
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4">
        <TrainingCard
          questions={questions}
          weakConcepts={weakConcepts}
          questionConcepts={questionConcepts}
          initialMastery={initialMastery}
        />
      </div>
    </div>
  );
}
