import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowLeft, Lightbulb, Sparkles } from "lucide-react";
import { requireStudentPage } from "@/lib/auth/role";
import { todayInBelgium } from "@/lib/plan-maia-date";

export const dynamic = "force-dynamic";

/**
 * Page Plan Maïa du jour (Sprint 4 PR S4-1, hot-fix hard review B2).
 *
 * Server component qui fetch le plan du jour de l'élève via Supabase admin.
 * Si pas de plan → redirect /accueil (où la card placeholder explique).
 *
 * Pour cette première version : page **overview** du plan (liste des questions
 * + reasons). Le vrai quiz dédié arrive en PR S4-2 :
 *   - table `plan_maia_answers` (id, plan_id, question_id, is_correct, created_at)
 *   - trigger DB qui increment `plan_maia_daily.completed_count` à chaque INSERT
 *   - quiz UI réutilisant MCQOptions/NumericInput/ShortTextInput
 *   - API check-answer-plan
 *
 * Note temporaire : l'élève peut voir son plan mais doit faire les questions
 * via les devoirs assignés (où le tracking marche déjà).
 */
export default async function PlanMaiaTodayPage() {
  const { user } = await requireStudentPage();
  const planDate = todayInBelgium();

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch plan + question details
  const { data: planRow } = await admin
    .from("plan_maia_daily")
    .select("*")
    .eq("user_id", user.id)
    .eq("plan_date", planDate)
    .maybeSingle();

  type PlanRow = {
    id: string;
    plan_data: {
      question_ids: string[];
      reasons_by_question_id?: Record<string, { bucket: string; reason: string }>;
      strategy?: string;
      estimated_minutes?: number;
      concept_breakdown?: { faible: number; revision: number; nouveau: number };
      is_beginner_mode?: boolean;
    };
    target_minutes: number;
    completed_count: number;
    completed_at: string | null;
  };

  /**
   * Validation défensive avant cast — un plan_data malformé (ex. migration
   * future qui change la forme, plan corrompu, race condition) ne doit pas
   * crash la page mais rediriger gracieusement vers /accueil.
   */
  function isValidPlanRow(row: unknown): row is PlanRow {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string") return false;
    if (typeof r.target_minutes !== "number") return false;
    if (typeof r.completed_count !== "number") return false;
    if (!r.plan_data || typeof r.plan_data !== "object") return false;
    const pd = r.plan_data as Record<string, unknown>;
    if (!Array.isArray(pd.question_ids)) return false;
    if (!pd.question_ids.every((id) => typeof id === "string")) return false;
    return true;
  }

  if (!planRow || !isValidPlanRow(planRow)) {
    // Pas de plan ou plan malformé → redirige vers /accueil (card explique)
    redirect("/accueil");
  }
  const plan = planRow;

  const questionIds = plan.plan_data.question_ids;
  const reasonsMap = plan.plan_data.reasons_by_question_id ?? {};
  const breakdown = plan.plan_data.concept_breakdown ?? {
    faible: 0,
    revision: 0,
    nouveau: 0,
  };
  const estimatedMin = plan.plan_data.estimated_minutes ?? plan.target_minutes;

  // Fetch question details pour preview
  const { data: questionsData } = await admin
    .from("teacher_questions")
    .select("id, question, type, difficulty_stars, subject_enum, concept_id")
    .in("id", questionIds);
  type QuestionRow = {
    id: string;
    question: string;
    type: string;
    difficulty_stars: 1 | 2 | 3 | null;
    subject_enum: string | null;
    concept_id: string | null;
  };
  const questions = (questionsData as QuestionRow[] | null) ?? [];

  // Préserver l'ordre du plan
  const orderedQuestions = questionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is QuestionRow => q !== undefined);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-6 sm:px-6" lang="fr-BE">
      <nav aria-label="Fil d'Ariane" className="mb-4">
        <Link
          href="/accueil"
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
          Retour à l&apos;accueil
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"
          >
            <Sparkles size={22} strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
              Plan Maïa du {planDate}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Ta session du jour
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <strong>{orderedQuestions.length} questions</strong> · ~{estimatedMin} min
              · {breakdown.faible} à retravailler, {breakdown.revision} en révision,{" "}
              {breakdown.nouveau} nouveau
            </p>
          </div>
        </div>
      </header>

      <section
        aria-labelledby="plan-list-title"
        className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="plan-list-title"
          className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Aperçu de tes questions
        </h2>
        <ol role="list" className="space-y-2">
          {orderedQuestions.map((q, i) => {
            const meta = reasonsMap[q.id];
            const bucketColor =
              meta?.bucket === "faible"
                ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                : meta?.bucket === "revision"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
            return (
              <li
                key={q.id}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950"
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                    {q.question.slice(0, 200)}
                    {q.question.length > 200 ? "…" : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {meta ? (
                      <span className={`rounded px-1.5 py-0.5 font-medium ${bucketColor}`}>
                        {meta.reason}
                      </span>
                    ) : null}
                    {q.difficulty_stars ? (
                      <span
                        aria-label={`Difficulté ${q.difficulty_stars} sur 3`}
                        className="text-yellow-500"
                      >
                        {"★".repeat(q.difficulty_stars)}
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                          {"★".repeat(3 - q.difficulty_stars)}
                        </span>
                      </span>
                    ) : null}
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {q.type === "mcq"
                        ? "QCM"
                        : q.type === "numeric"
                          ? "Numérique"
                          : q.type === "short_text"
                            ? "Réponse courte"
                            : q.type}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <aside
        aria-labelledby="plan-info-title"
        className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30"
      >
        <div className="flex items-start gap-2">
          <Lightbulb
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400"
          />
          <div>
            <h2
              id="plan-info-title"
              className="text-sm font-semibold text-amber-900 dark:text-amber-200"
            >
              Session quiz dédiée arrivant bientôt
            </h2>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
              Pour l&apos;instant, tu peux voir ton plan ici mais le quiz personnalisé
              dédié Plan Maïa arrive en prochain sprint. En attendant, fais tes devoirs
              assignés sur la page{" "}
              <Link
                href="/accueil/devoirs"
                className="font-semibold underline hover:no-underline"
              >
                Devoirs
              </Link>
              {" "}— les questions répondues alimentent ton plan suivant.
            </p>
          </div>
        </div>
      </aside>
    </main>
  );
}
