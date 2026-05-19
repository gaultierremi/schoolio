import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { requireStudentPage } from "@/lib/auth/role";
import {
  computeMasteryPct,
  groupQuestionsByConcept,
  latestAnswerByQuestion,
} from "@/lib/assignment-student-detail";
import AssignmentBilanClient from "./_components/AssignmentBilanClient";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sprint 5 PR S5-3 — Page bilan post-quiz élève.
 *
 * Page persistante (URL shareable) qui détaille le devoir terminé par concept.
 * Différente de l'écran "finished" du quiz qui est éphémère (score + redirect).
 *
 * Réutilise `lib/assignment-student-detail.ts` (testé Sprint 5 PR S5-1)
 * pour l'agrégation par concept — pas de duplication.
 *
 * Sécurité : élève ne voit QUE ses propres bilans (filtre student_user_id =
 * user.id). RLS Supabase fait le double-check côté DB.
 *
 * UX : si le devoir n'a pas encore été commencé/répondu, redirige vers la
 * page devoir (pas de bilan vide à afficher).
 */
export default async function AssignmentBilanPage({
  params,
}: {
  params: { id: string };
}) {
  const { user } = await requireStudentPage();

  if (!UUID_REGEX.test(params.id)) {
    notFound();
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch parallèle : assignment + completion + answers + questions (avec concepts)
  const [assignmentRes, completionRes, answersRes, aqRes] = await Promise.all([
    admin
      .from("assignments")
      .select("id, title, description, class_id")
      .eq("id", params.id)
      .maybeSingle(),
    admin
      .from("assignment_completions")
      .select("status, score, completed_at, started_at, attempts_count")
      .eq("assignment_id", params.id)
      .eq("student_user_id", user.id)
      .maybeSingle(),
    admin
      .from("assignment_question_answers")
      .select("question_id, is_correct, requested_solution, requested_explanation, created_at")
      .eq("assignment_id", params.id)
      .eq("student_user_id", user.id),
    admin
      .from("assignment_questions")
      .select("question_id, position")
      .eq("assignment_id", params.id)
      .order("position", { ascending: true }),
  ]);
  if (assignmentRes.error) throw assignmentRes.error;
  if (completionRes.error) throw completionRes.error;
  if (answersRes.error) throw answersRes.error;
  if (aqRes.error) throw aqRes.error;

  const assignment = assignmentRes.data as
    | { id: string; title: string; description: string | null; class_id: string }
    | null;
  if (!assignment) notFound();

  const completion = completionRes.data as
    | {
        status: string;
        score: number | null;
        completed_at: string | null;
        started_at: string | null;
        attempts_count: number;
      }
    | null;

  type AQ = { question_id: string; position: number };
  const assignmentQuestions = (aqRes.data as AQ[] | null) ?? [];
  const questionIds = assignmentQuestions.map((q) => q.question_id);
  const questionIdToPosition = new Map(
    assignmentQuestions.map((q) => [q.question_id, q.position]),
  );

  // Si pas encore de réponses, redirige vers la page devoir (briefing)
  type AnswerRow = {
    question_id: string;
    is_correct: boolean;
    requested_solution: boolean;
    requested_explanation: boolean;
    created_at: string;
  };
  const answers = (answersRes.data as AnswerRow[] | null) ?? [];
  if (answers.length === 0) {
    redirect(`/accueil/devoirs/${params.id}`);
  }

  // Fetch question details + concepts
  const questionsRes =
    questionIds.length === 0
      ? { data: [] as QuestionRow[], error: null }
      : await admin
          .from("teacher_questions")
          .select("id, question, type, difficulty_stars, concept_id")
          .in("id", questionIds);
  if (questionsRes.error) throw questionsRes.error;
  type QuestionRow = {
    id: string;
    question: string;
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

  // Agrégation via helpers purs réutilisés de S5-1
  const answerByQuestion = latestAnswerByQuestion(answers);
  const enrichedQuestions = questions.map((q) => ({
    id: q.id,
    concept_id: q.concept_id,
    position: questionIdToPosition.get(q.id) ?? 0,
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
  const answeredCount = answers.length;
  // Une question peut avoir plusieurs réponses (retry) — on prend dernière
  const uniqueAnswered = answerByQuestion.size;
  const correctCount = Array.from(answerByQuestion.values()).filter((a) => a.is_correct).length;
  const overallPct = uniqueAnswered === 0 ? 0 : Math.round((100 * correctCount) / uniqueAnswered);

  // Indices/solution consultés (insight UX)
  const solutionViews = answers.filter((a) => a.requested_solution).length;
  const explanationViews = answers.filter((a) => a.requested_explanation).length;

  // Durée (si started_at + completed_at dispo)
  let durationMinutes: number | null = null;
  if (completion?.started_at && completion.completed_at) {
    const ms =
      new Date(completion.completed_at).getTime() - new Date(completion.started_at).getTime();
    durationMinutes = Math.max(1, Math.round(ms / 60000));
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-6 sm:px-6" lang="fr-BE">
      <nav aria-label="Fil d'Ariane" className="mb-4">
        <Link
          href={`/accueil/devoirs/${params.id}`}
          className="
            inline-flex items-center gap-1.5 rounded-md text-sm text-slate-600 transition
            hover:text-slate-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:text-slate-400 dark:hover:text-slate-200
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Retour au devoir
        </Link>
      </nav>

      <AssignmentBilanClient
        assignmentId={assignment.id}
        assignmentTitle={assignment.title}
        status={completion?.status ?? "not_started"}
        completedAt={completion?.completed_at ?? null}
        attemptsCount={completion?.attempts_count ?? 0}
        overallPct={overallPct}
        correctCount={correctCount}
        uniqueAnswered={uniqueAnswered}
        totalQuestions={questions.length}
        answersCount={answeredCount}
        solutionViews={solutionViews}
        explanationViews={explanationViews}
        durationMinutes={durationMinutes}
        byConcept={byConcept}
      />
    </main>
  );
}
