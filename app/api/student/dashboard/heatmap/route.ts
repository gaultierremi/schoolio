/**
 * GET /api/student/dashboard/heatmap
 *
 * Vue progression élève par sous-classe matière (PR #27) :
 *   - Liste les classes (cohorte + sous-classes matière) où l'élève est membre.
 *   - Pour chaque sous-classe : agrège la maîtrise par concept depuis
 *     assignment_question_answers (is_correct) joint sur teacher_questions.
 *   - Si teacher_questions.concept_id est NULL (rétrocompat avant pipeline
 *     concept-aware), groupe par assignment (chaque devoir = un bucket).
 *   - Renvoie aussi les stats d'effort cette semaine (questions, minutes
 *     approx, daily breakdown, streak).
 *
 * CLAUDE.md règles 4-7 respectées :
 *   - auth en première instruction (requireUser)
 *   - jamais body.user_id (GET sans body)
 *   - réponses via apiError/safeError
 */

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiOk, safeError } from "@/lib/api/respond";
import type {
  HeatmapData,
  SubjectClass,
  ConceptBucket,
  DailyEffort,
} from "@/lib/types/student-dashboard";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Mastery = (correct / max(attempts, 1)) * 100, capped 0..100. */
function masteryFor(correct: number, attempts: number): number {
  if (attempts === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((correct / attempts) * 100)));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const userId = auth.user.id;

    const admin = createAdminClient();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();

    // ── 1. Memberships : classes où l'élève est actif ──────────────────────
    const { data: memberships } = await admin
      .from("class_memberships")
      .select("class_id, classes!inner(id, name, level, subject, parent_class_id)")
      .eq("student_user_id", userId)
      .eq("status", "active");

    type MemberRow = {
      class_id: string;
      classes: {
        id: string;
        name: string;
        level: string | null;
        subject: string | null;
        parent_class_id: string | null;
      };
    };
    const memberRows = (memberships ?? []) as unknown as MemberRow[];

    if (memberRows.length === 0) {
      const empty: HeatmapData = {
        subject_classes: [],
        weekly_minutes: 0,
        weekly_questions: 0,
        weekly_correct_rate: null,
        daily_effort: [],
        streak_days: 0,
      };
      return apiOk(empty);
    }

    // Map parent class id → name (cohorte). On fetch les parents pour afficher
    // "4D Chimie · 4ème D" — le parent renseigne la cohorte de l'élève.
    const parentIds = [
      ...new Set(memberRows.map((r) => r.classes.parent_class_id).filter((v): v is string => !!v)),
    ];
    const parentNameMap: Record<string, string> = {};
    if (parentIds.length > 0) {
      const { data: parents } = await admin
        .from("classes")
        .select("id, name")
        .in("id", parentIds);
      for (const p of (parents ?? []) as { id: string; name: string }[]) {
        parentNameMap[p.id] = p.name;
      }
    }

    // ── 2. Assignments des classes de l'élève ──────────────────────────────
    const classIds = memberRows.map((r) => r.class_id);

    const { data: assignments } = await admin
      .from("assignments")
      .select("id, title, class_id, resource_type, resource_id, due_date")
      .in("class_id", classIds)
      .is("archived_at", null);

    type AssignRow = {
      id: string;
      title: string;
      class_id: string;
      resource_type: string;
      resource_id: string;
      due_date: string | null;
    };
    const assignRows = (assignments ?? []) as AssignRow[];
    const assignmentIds = assignRows.map((a) => a.id);

    // ── 3. Tous les answers de l'élève sur ces devoirs ─────────────────────
    type AnswerRow = {
      assignment_id: string;
      question_id: string;
      is_correct: boolean;
      created_at: string;
    };
    let answers: AnswerRow[] = [];
    if (assignmentIds.length > 0) {
      const { data: answersData } = await admin
        .from("assignment_question_answers")
        .select("assignment_id, question_id, is_correct, created_at")
        .eq("student_user_id", userId)
        .in("assignment_id", assignmentIds);
      answers = (answersData ?? []) as AnswerRow[];
    }

    // ── 4. teacher_questions : récupérer concept_id pour les questions vues ─
    const questionIds = [...new Set(answers.map((a) => a.question_id))];
    type TQRow = { id: string; concept_id: string | null };
    let tqRows: TQRow[] = [];
    if (questionIds.length > 0) {
      const { data: tqData } = await admin
        .from("teacher_questions")
        .select("id, concept_id")
        .in("id", questionIds);
      tqRows = (tqData ?? []) as TQRow[];
    }
    const conceptByQuestion: Record<string, string | null> = {};
    for (const tq of tqRows) conceptByQuestion[tq.id] = tq.concept_id;

    // ── 5. concepts : labels (name) pour les concept_ids vus ───────────────
    const conceptIds = [
      ...new Set(Object.values(conceptByQuestion).filter((v): v is string => !!v)),
    ];
    type ConceptRow = { id: string; name: string };
    let conceptRows: ConceptRow[] = [];
    if (conceptIds.length > 0) {
      const { data: cData } = await admin
        .from("concepts")
        .select("id, name")
        .in("id", conceptIds);
      conceptRows = (cData ?? []) as ConceptRow[];
    }
    const conceptNameMap: Record<string, string> = {};
    for (const c of conceptRows) conceptNameMap[c.id] = c.name;

    // ── 6. Index answers par classe : on retrouve la classe via l'assignment ─
    const classByAssignment: Record<string, string> = {};
    for (const a of assignRows) classByAssignment[a.id] = a.class_id;

    type Stat = { correct: number; attempts: number; last_seen: string | null };
    const bucketStats: Record<string, Record<string, Stat>> = {};
    // bucketStats[class_id][bucketKey] = stat

    // Aussi mémoriser le label de chaque bucket pour rendu UI
    const bucketLabels: Record<string, Record<string, string>> = {};
    // Et savoir si bucket = concept (true) ou assignment fallback (false) pour le priority hint
    const bucketIsConcept: Record<string, Record<string, boolean>> = {};

    // Map assignmentId → due_date pour priority flag
    const dueDateMap: Record<string, string | null> = {};
    for (const a of assignRows) dueDateMap[a.id] = a.due_date;
    const assignTitleMap: Record<string, string> = {};
    for (const a of assignRows) assignTitleMap[a.id] = a.title;

    // Set des assignments avec deadline future (< 14 jours = priority candidats)
    const nowMs = now.getTime();
    const horizonMs = 14 * 24 * 60 * 60 * 1000;
    const futureAssignSet = new Set(
      assignRows
        .filter((a) => a.due_date && new Date(a.due_date).getTime() > nowMs && new Date(a.due_date).getTime() - nowMs < horizonMs)
        .map((a) => a.id),
    );

    // Track quels assignments contribuent au bucket (pour calcul priority)
    const bucketAssignSet: Record<string, Record<string, Set<string>>> = {};

    for (const ans of answers) {
      const classId = classByAssignment[ans.assignment_id];
      if (!classId) continue;

      const conceptId = conceptByQuestion[ans.question_id];
      // Bucket key : concept_id si présent, sinon assignment_id (fallback)
      const bucketKey = conceptId ?? `assign:${ans.assignment_id}`;
      const label = conceptId
        ? (conceptNameMap[conceptId] ?? "Concept")
        : (assignTitleMap[ans.assignment_id] ?? "Devoir");

      if (!bucketStats[classId]) bucketStats[classId] = {};
      if (!bucketLabels[classId]) bucketLabels[classId] = {};
      if (!bucketIsConcept[classId]) bucketIsConcept[classId] = {};
      if (!bucketAssignSet[classId]) bucketAssignSet[classId] = {};

      if (!bucketStats[classId][bucketKey]) {
        bucketStats[classId][bucketKey] = { correct: 0, attempts: 0, last_seen: null };
        bucketLabels[classId][bucketKey] = label;
        bucketIsConcept[classId][bucketKey] = !!conceptId;
        bucketAssignSet[classId][bucketKey] = new Set();
      }
      const s = bucketStats[classId][bucketKey];
      s.attempts += 1;
      if (ans.is_correct) s.correct += 1;
      if (!s.last_seen || ans.created_at > s.last_seen) s.last_seen = ans.created_at;
      bucketAssignSet[classId][bucketKey].add(ans.assignment_id);
    }

    // ── 7. Construit SubjectClass[] ────────────────────────────────────────
    // On surface :
    //   - les sous-classes matière (parent_class_id != null) en priorité
    //   - les cohortes / classes legacy mono-matière en complément
    const subjectClasses: SubjectClass[] = memberRows.map((r) => {
      const cls = r.classes;
      const stats = bucketStats[cls.id] ?? {};
      const labels = bucketLabels[cls.id] ?? {};
      const isConceptMap = bucketIsConcept[cls.id] ?? {};
      const assignSets = bucketAssignSet[cls.id] ?? {};

      const concepts: ConceptBucket[] = Object.entries(stats).map(([key, s]) => {
        // priority = au moins un assignment lié au bucket est dans futureAssignSet
        const assignSet = assignSets[key] ?? new Set<string>();
        let priority = false;
        for (const aid of assignSet) {
          if (futureAssignSet.has(aid)) {
            priority = true;
            break;
          }
        }
        return {
          key,
          label: labels[key] ?? "Concept",
          mastery: masteryFor(s.correct, s.attempts),
          attempts: s.attempts,
          correct: s.correct,
          last_seen: s.last_seen,
          priority,
        };
      });

      // Trier : priority desc, mastery asc (le plus faible en premier = à bosser)
      concepts.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority ? -1 : 1;
        return a.mastery - b.mastery;
      });

      // Marque ne plus qu'un seul priority (le plus faible)
      let firstPriorityFound = false;
      for (const c of concepts) {
        if (c.priority) {
          if (firstPriorityFound) c.priority = false;
          else firstPriorityFound = true;
        }
      }
      // Si aucun priority (pas de deadline future) on flag le plus faible
      if (!firstPriorityFound && concepts.length > 0 && concepts[0].mastery < 50) {
        concepts[0].priority = true;
      }

      const parentName = cls.parent_class_id ? (parentNameMap[cls.parent_class_id] ?? null) : null;

      return {
        class_id: cls.id,
        class_name: cls.name,
        subject: cls.subject,
        level: cls.level,
        parent_class_name: parentName,
        concepts,
      };
    });

    // Trier : sous-classes matière (parent != null) d'abord, puis cohortes
    subjectClasses.sort((a, b) => {
      const aIsSub = !!a.parent_class_name;
      const bIsSub = !!b.parent_class_name;
      if (aIsSub !== bIsSub) return aIsSub ? -1 : 1;
      return a.class_name.localeCompare(b.class_name);
    });

    // ── 8. Stats hebdomadaires (effort) ────────────────────────────────────
    const weeklyAnswers = answers.filter((a) => a.created_at >= sevenDaysAgoIso);
    const weeklyQuestionsSet = new Set(weeklyAnswers.map((a) => a.question_id));
    const weeklyCorrect = weeklyAnswers.filter((a) => a.is_correct).length;
    const weeklyTotal = weeklyAnswers.length;
    const weeklyCorrectRate = weeklyTotal > 0 ? Math.round((weeklyCorrect / weeklyTotal) * 100) : null;
    // Estimation : 30 secondes par réponse → minutes = answers * 0.5
    const weeklyMinutes = Math.round(weeklyTotal * 0.5);

    // Daily effort : 7 derniers jours
    const dailyMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailyMap[isoDate(d)] = 0;
    }
    for (const ans of weeklyAnswers) {
      const d = ans.created_at.slice(0, 10);
      if (dailyMap[d] !== undefined) dailyMap[d] += 1;
    }
    const dailyEffort: DailyEffort[] = Object.entries(dailyMap).map(([date, n]) => ({
      date,
      questions_answered: n,
    }));

    // Streak : jours consécutifs avec ≥ 1 réponse, en partant d'aujourd'hui
    let streakDays = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const day = isoDate(d);
      const count = dailyMap[day];
      if (count !== undefined) {
        // Dans la fenêtre déjà précomputée
        if (count > 0) streakDays += 1;
        else if (i === 0) {
          // Aujourd'hui sans réponse → on ne casse pas la streak (laisse la chance
          // à l'élève de jouer plus tard dans la journée). On continue à reculer.
          continue;
        } else break;
      } else {
        // Au-delà des 7 derniers jours : on recompute depuis answers (pas dans dailyMap)
        const dayStart = new Date(day + "T00:00:00.000Z").getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        const hasActivity = answers.some((a) => {
          const t = new Date(a.created_at).getTime();
          return t >= dayStart && t < dayEnd;
        });
        if (hasActivity) streakDays += 1;
        else break;
      }
    }

    const result: HeatmapData = {
      subject_classes: subjectClasses,
      weekly_minutes: weeklyMinutes,
      weekly_questions: weeklyQuestionsSet.size,
      weekly_correct_rate: weeklyCorrectRate,
      daily_effort: dailyEffort,
      streak_days: streakDays,
    };

    return apiOk(result);
  } catch (err) {
    return safeError(err, "student/dashboard/heatmap:GET");
  }
}
