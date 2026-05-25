import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { requireStudentPage } from "@/lib/auth/role";
import { todayInBelgium } from "@/lib/plan-maia-date";
import {
  computeMasteryPct,
  groupQuestionsByConcept,
  latestAnswerByQuestion,
} from "@/lib/assignment-student-detail";
import PlanMaiaBilanClient from "./_components/PlanMaiaBilanClient";

export const dynamic = "force-dynamic";

/**
 * Sprint 6 PR S6-6 — Page bilan post Plan Maïa quotidien.
 *
 * Pattern hérité de S5-3 `AssignmentBilan` :
 * - Hero score + encouragement adulte bienveillant
 * - KPI grid
 * - Section concepts touchés avec mastery
 *
 * Différence : pas de "Continuer le devoir" car Plan Maïa est journalier
 * (CTAs : Retour accueil, Voir mon overview du plan).
 *
 * Réutilise helpers purs S5-1 (latestAnswerByQuestion, computeMasteryPct,
 * groupQuestionsByConcept) — anti-dette.
 *
 * Si aucune réponse encore : redirige vers le quiz (pas de bilan vide).
 */
export const metadata = {
  title: "Bilan Plan Maïa · Maïa",
};

export default async function PlanMaiaBilanPage() {
  const { user } = await requireStudentPage();
  const planDate = todayInBelgium();

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Fetch plan + answers + questions (parallèle)
  const planRes = await admin
    .from("plan_maia_daily")
    .select("id, plan_data, completed_count, completed_at")
    .eq("user_id", user.id)
    .eq("plan_date", planDate)
    .maybeSingle();
  if (planRes.error) throw planRes.error;

  type PlanRow = {
    id: string;
    plan_data: { question_ids?: string[] };
    completed_count: number;
    completed_at: string | null;
  };
  const plan = planRes.data as PlanRow | null;
  if (!plan) redirect("/accueil");

  const questionIds = plan.plan_data.question_ids ?? [];
  if (questionIds.length === 0) redirect("/accueil/plan-maia/today");

  const answersRes = await admin
    .from("plan_maia_answers")
    .select("question_id, is_correct, requested_solution, requested_explanation, created_at")
    .eq("plan_id", plan.id)
    .eq("user_id", user.id);
  if (answersRes.error) throw answersRes.error;

  type AnswerRow = {
    question_id: string;
    is_correct: boolean;
    requested_solution: boolean;
    requested_explanation: boolean;
    created_at: string;
  };
  const answers = (answersRes.data as AnswerRow[] | null) ?? [];

  // Pas de réponse → renvoie vers le quiz (rien à bilan)
  if (answers.length === 0) {
    redirect("/accueil/plan-maia/today/quiz");
  }

  // 2. Fetch questions + concepts
  const questionsRes = await admin
    .from("teacher_questions")
    .select("id, type, difficulty_stars, concept_id")
    .in("id", questionIds);
  if (questionsRes.error) throw questionsRes.error;
  type QuestionRow = {
    id: string;
    type: string;
    difficulty_stars: 1 | 2 | 3 | null;
    concept_id: string | null;
  };
  const questions = (questionsRes.data as QuestionRow[] | null) ?? [];

  const conceptIds = Array.from(
    new Set(questions.map((q) => q.concept_id).filter((id): id is string => id !== null)),
  );
  let concepts: { id: string; name: string }[] = [];
  if (conceptIds.length > 0) {
    const conceptsRes = await admin
      .from("concepts")
      .select("id, name")
      .in("id", conceptIds)
      .order("name", { ascending: true });
    if (conceptsRes.error) throw conceptsRes.error;
    concepts = (conceptsRes.data as { id: string; name: string }[] | null) ?? [];
  }

  // 3. Agrégation via helpers purs S5-1
  const answerByQuestion = latestAnswerByQuestion(answers);
  const enrichedQuestions = questions.map((q) => ({
    id: q.id,
    concept_id: q.concept_id,
    position: questionIds.indexOf(q.id),
    is_correct: answerByQuestion.get(q.id)?.is_correct ?? null,
  }));
  const { byConceptId } = groupQuestionsByConcept(enrichedQuestions);

  const byConcept = concepts.map((c) => {
    const cQuestions = byConceptId.get(c.id) ?? [];
    const answered = cQuestions
      .filter((q) => q.is_correct !== null)
      .map((q) => ({ is_correct: q.is_correct as boolean }));
    return {
      concept: c,
      total: cQuestions.length,
      answered: answered.length,
      masteryPct: computeMasteryPct(answered),
    };
  });

  // Stats globales
  const uniqueAnswered = answerByQuestion.size;
  const correctCount = Array.from(answerByQuestion.values()).filter((a) => a.is_correct).length;
  const overallPct = uniqueAnswered === 0 ? 0 : Math.round((100 * correctCount) / uniqueAnswered);
  const solutionViews = answers.filter((a) => a.requested_solution).length;
  const explanationViews = answers.filter((a) => a.requested_explanation).length;

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-6 sm:px-6" lang="fr-BE">
      <nav aria-label="Fil d'Ariane" className="mb-4">
        <Link
          href="/accueil/plan-maia/today"
          className="
            inline-flex items-center gap-1.5 rounded-md text-sm text-slate-600 transition
            hover:text-slate-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:text-slate-400 dark:hover:text-slate-200
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Retour à mon plan
        </Link>
      </nav>

      <PlanMaiaBilanClient
        planDate={planDate}
        isCompleted={plan.completed_at !== null}
        completedAt={plan.completed_at}
        overallPct={overallPct}
        correctCount={correctCount}
        uniqueAnswered={uniqueAnswered}
        totalQuestions={questions.length}
        solutionViews={solutionViews}
        explanationViews={explanationViews}
        byConcept={byConcept}
      />
    </main>
  );
}
