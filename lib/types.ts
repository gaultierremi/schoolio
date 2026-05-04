export type QuestionStatus = "pending" | "approved" | "rejected";

export type Question = {
  id: string;
  image_url: string;
  source_url: string | null;
  answer: string;
  hint: string | null;
  period: string | null;
  difficulty: number | null;
  created_at: string;
  status: QuestionStatus;
  rejection_reason: string | null;
};

export type QuizQuestionType = "mcq" | "truefalse";
export type QuizDifficulty = 1 | 2 | 3;
export type QuizQuestionStatus = "pending" | "to_check" | "approved" | "rejected";

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
  period: string | null;
  difficulty: QuizDifficulty;
  status: QuizQuestionStatus;
  rejection_reason: string | null;
  created_at: string;
};

export type DuelStatus = "waiting" | "ready" | "playing" | "finished";

export type Duel = {
  id: string;
  code: string;
  difficulty: QuizDifficulty;
  question_ids: string[];
  host_id: string;
  host_name: string;
  guest_id: string | null;
  guest_name: string | null;
  status: DuelStatus;
  host_score: number | null;
  guest_score: number | null;
  created_at: string;
};

export type TimelineEvent = {
  id: string;
  title: string;
  description: string | null;
  year: number;
  image_url: string | null;
  category: string | null;
  difficulty: 1 | 2 | 3;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  fun_fact: string | null;
  created_at: string;
};

export type DailyChallenge = {
  id: string;
  date: string;
  event_ids: string[];
  created_at: string;
};

export type DailyScore = {
  id: string;
  challenge_id: string;
  user_id: string;
  user_name: string;
  score: number;
  max_score: number;
  created_at: string;
};
