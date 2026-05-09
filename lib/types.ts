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

