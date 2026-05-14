export type AssignmentStatus = "pending" | "in_progress" | "overdue";
export type LetterGrade = "A" | "B" | "C" | "D";

export type UpcomingAssignment = {
  id: string;
  title: string;
  course_title: string | null;
  class_name: string;
  deadline: string | null;
  estimated_minutes: number | null;
  status: AssignmentStatus;
};

export type RecentCompletion = {
  id: string;
  title: string;
  course_title: string | null;
  class_name: string;
  completed_at: string;
  score: number | null;
};

export type ScheduleSlot = {
  time_start: string;
  time_end: string;
  course_title: string;
  room: string | null;
  teacher_name: string;
};

export type AvailableCourse = {
  id: string;
  title: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string;
};

export type WeeklyStats = {
  assignments_completed: number;
  questions_practiced: number;
  avg_grade_letter: LetterGrade | null;
};

export type DashboardData = {
  upcoming_assignments: UpcomingAssignment[];
  recent_completions: RecentCompletion[];
  today_schedule: ScheduleSlot[];
  available_courses: AvailableCourse[];
  weekly_stats: WeeklyStats;
};

// ── Heatmap / sous-classes matière (PR #27) ───────────────────────────────
// Une sous-classe matière (parent_class_id != null) est une branche d'une
// cohorte. L'élève voit sa progression par matière (concept buckets).

export type ConceptBucket = {
  /** Identifiant stable du bucket : concept_id ou (fallback) assignment_id. */
  key: string;
  label: string;
  /** 0..100. Calculé à partir de assignment_question_answers (is_correct). */
  mastery: number;
  attempts: number;
  correct: number;
  /** ISO date du dernier answer pour ce bucket, null si jamais. */
  last_seen: string | null;
  /** True si le bucket est attaché à un devoir avec deadline future = thème prioritaire. */
  priority: boolean;
};

export type SubjectClass = {
  /** id de la sous-classe matière (ou de la classe si pas de hiérarchie). */
  class_id: string;
  /** Nom affiché (ex: "4D Chimie" pour sous-classe, "Founders Testing" pour cohorte). */
  class_name: string;
  /** Slug matière normalisé (chimie, mathematiques, etc.). NULL si cohorte mono-mixte. */
  subject: string | null;
  /** Niveau d'année (ex: "4", "5"). */
  level: string | null;
  /** Nom de la cohorte parente, NULL si la classe est elle-même une cohorte. */
  parent_class_name: string | null;
  /** Buckets de concepts pour la heatmap. */
  concepts: ConceptBucket[];
};

export type DailyEffort = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Nombre de questions répondues ce jour. */
  questions_answered: number;
};

export type HeatmapData = {
  /** Sous-classes matière + concepts. Cohortes mono-matière incluses pour compat. */
  subject_classes: SubjectClass[];
  /** Total minutes d'effort cette semaine (approximé par #réponses × 0.5 min). */
  weekly_minutes: number;
  /** Total questions répondues cette semaine. */
  weekly_questions: number;
  /** % correct au 1er essai (groupé par question_id pour dédupliquer). */
  weekly_correct_rate: number | null;
  /** Effort jour par jour, 7 derniers jours, ordre asc. */
  daily_effort: DailyEffort[];
  /** Streak (jours consécutifs avec au moins 1 réponse). */
  streak_days: number;
};

// ── Assignments index (interface devoirs séparée du quiz) ────────────────

export type AssignmentStatusExtended = "pending" | "in_progress" | "completed" | "overdue";

export type AssignmentItem = {
  id: string;
  title: string;
  description: string | null;
  resource_type: "pdf" | "quiz";
  course_title: string | null;
  class_id: string;
  class_name: string;
  /** Slug matière (chimie, mathematiques…). NULL si cohorte mono-mixte. */
  subject: string | null;
  due_date: string | null;
  status: AssignmentStatusExtended;
  /** % score [0,100], null si pas complété. */
  score: number | null;
  attempts_count: number;
  completed_at: string | null;
  last_attempt_at: string | null;
};

export type AssignmentsIndex = {
  todo: AssignmentItem[];      // pending + in_progress avec deadline future
  overdue: AssignmentItem[];   // due_date < now et pas completed
  completed: AssignmentItem[]; // status=completed
};
