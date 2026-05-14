/**
 * Pure grading function — no I/O, fully testable.
 *
 * Kept separate from the route so Vitest can import it without Next.js context.
 */

export type QuestionType = "mcq" | "truefalse" | "numeric" | "short_text" | "multi_step";

export interface GradableQuestion {
  type: QuestionType;
  /** For mcq / truefalse */
  answer_index?: number | null;
  /** For numeric */
  expected_numeric_answer?: number | null;
  numeric_tolerance?: number | null;
  /** For short_text — array of accepted answers */
  expected_text_answers?: string[] | null;
}

export type CheckResult =
  | { is_correct: boolean }
  | { is_correct: false; error: string };

/**
 * Normalize a string for accent-insensitive, case-insensitive comparison.
 */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Grade a student answer against a question definition.
 * Returns a CheckResult — never throws.
 */
export function checkAnswer(
  question: GradableQuestion,
  studentAnswer: string | number,
): CheckResult {
  switch (question.type) {
    case "mcq":
    case "truefalse": {
      if (question.answer_index == null) {
        return { is_correct: false, error: "Question sans answer_index configuré" };
      }
      const answerNum = typeof studentAnswer === "number" ? studentAnswer : Number(studentAnswer);
      return { is_correct: answerNum === question.answer_index };
    }

    case "numeric": {
      if (question.expected_numeric_answer == null) {
        return { is_correct: false, error: "Question sans expected_numeric_answer configuré" };
      }
      const studentNum =
        typeof studentAnswer === "number" ? studentAnswer : Number(studentAnswer);
      if (!Number.isFinite(studentNum)) {
        return { is_correct: false };
      }
      const tolerance = question.numeric_tolerance ?? 0.01;
      const diff = Math.abs(studentNum - question.expected_numeric_answer);
      return { is_correct: diff <= tolerance };
    }

    case "short_text": {
      if (!question.expected_text_answers || question.expected_text_answers.length === 0) {
        return { is_correct: false, error: "Question sans expected_text_answers configuré" };
      }
      if (typeof studentAnswer !== "string") {
        return { is_correct: false };
      }
      const studentNorm = normalize(studentAnswer);
      const matched = question.expected_text_answers.map(normalize).includes(studentNorm);
      return { is_correct: matched };
    }

    case "multi_step": {
      return { is_correct: false, error: "Type multi_step pas encore supporté" };
    }

    default: {
      // Exhaustiveness guard — TypeScript will catch unknown types at compile time.
      return { is_correct: false, error: `Type inconnu` };
    }
  }
}
