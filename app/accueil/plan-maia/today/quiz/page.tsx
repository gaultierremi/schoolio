import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { requireStudentPage } from "@/lib/auth/role";
import { todayInBelgium } from "@/lib/plan-maia-date";
import PlanMaiaQuizClient from "./_components/PlanMaiaQuizClient";

export const dynamic = "force-dynamic";

/**
 * Sprint 5 PR S5-4 — Page quiz dédiée Plan Maïa du jour.
 *
 * Server component qui :
 * 1. Auth élève + récupère le plan du jour (timezone Europe/Brussels)
 * 2. Fetch les questions du plan + déjà répondues (filtre côté UI)
 * 3. Délègue au composant client pour le quiz interactif
 *
 * Si pas de plan → redirige vers /accueil (card placeholder explique).
 * Si plan déjà terminé → redirige vers /accueil/plan-maia/today (overview).
 *
 * Pattern hérité S4-1 (todayInBelgium pour timezone) + S5-3 (validation
 * défensive avant cast).
 */
export default async function PlanMaiaQuizPage() {
  const { user } = await requireStudentPage();
  const planDate = todayInBelgium();

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Fetch plan
  const planRes = await admin
    .from("plan_maia_daily")
    .select("id, plan_data, target_minutes, completed_count, completed_at")
    .eq("user_id", user.id)
    .eq("plan_date", planDate)
    .maybeSingle();
  if (planRes.error) throw planRes.error;

  type PlanRow = {
    id: string;
    plan_data: {
      question_ids?: string[];
      reasons_by_question_id?: Record<string, { bucket: string; reason: string }>;
      estimated_minutes?: number;
    };
    target_minutes: number;
    completed_count: number;
    completed_at: string | null;
  };

  const plan = planRes.data as PlanRow | null;
  if (!plan) redirect("/accueil");

  const questionIds = plan.plan_data.question_ids ?? [];
  if (questionIds.length === 0) {
    // Plan corrompu / vide → renvoyer vers l'overview qui explique
    redirect("/accueil/plan-maia/today");
  }

  // 2. Fetch questions complètes (champs requis pour les input types)
  // Note : la colonne s'appelle `numeric_unit` en DB (pas `unit`).
  const questionsRes = await admin
    .from("teacher_questions")
    .select(
      "id, type, question, options, numeric_unit, difficulty_stars, subject_enum, concept_id, image_url, image_description_md, image_page_number",
    )
    .in("id", questionIds);
  if (questionsRes.error) throw questionsRes.error;

  type QuestionRow = {
    id: string;
    type: string;
    question: string;
    options: string[] | null;
    numeric_unit: string | null;
    difficulty_stars: 1 | 2 | 3 | null;
    subject_enum: string | null;
    concept_id: string | null;
    image_url: string | null;
    image_description_md: string | null;
    image_page_number: number | null;
  };
  const questions = (questionsRes.data as QuestionRow[] | null) ?? [];
  const orderedQuestions = questionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is QuestionRow => q !== undefined);

  // 3. Fetch déjà répondues pour reprendre où l'élève s'est arrêté
  const answersRes = await admin
    .from("plan_maia_answers")
    .select("question_id, is_correct")
    .eq("plan_id", plan.id)
    .eq("user_id", user.id);
  if (answersRes.error) throw answersRes.error;
  type AnswerRow = { question_id: string; is_correct: boolean };
  const answered = (answersRes.data as AnswerRow[] | null) ?? [];

  // Dedupe : on garde le DERNIER état (si retry → nouvelle insert mais on
  // affiche seulement "déjà répondue" sans valeur)
  const answeredSet = new Set(answered.map((a) => a.question_id));

  // Si toutes répondues → bilan
  const totalQuestions = orderedQuestions.length;
  if (answeredSet.size >= totalQuestions) {
    redirect("/accueil/plan-maia/today/bilan");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6 sm:px-6" lang="fr-BE">
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

      <PlanMaiaQuizClient
        planId={plan.id}
        questions={orderedQuestions.map((q) => ({
          id: q.id,
          type: q.type,
          question: q.question,
          options: q.options,
          unit: q.numeric_unit,
          difficulty_stars: q.difficulty_stars,
          concept_id: q.concept_id,
          image_url: q.image_url,
          image_description_md: q.image_description_md,
          image_page_number: q.image_page_number,
        }))}
        alreadyAnsweredIds={Array.from(answeredSet)}
      />
    </main>
  );
}
