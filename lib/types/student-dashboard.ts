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
  live_participations: number;
  avg_grade_letter: LetterGrade | null;
};

export type DashboardData = {
  upcoming_assignments: UpcomingAssignment[];
  recent_completions: RecentCompletion[];
  today_schedule: ScheduleSlot[];
  available_courses: AvailableCourse[];
  weekly_stats: WeeklyStats;
};
