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
 *
 * - Lowercase
 * - Trim
 * - Strip diacritics (é → e, à → a, etc.)
 * - Strip ponctuation usuelle (.,;:!?'"«»)
 * - Collapse multi-spaces
 */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.,;:!?'"«»()’‘“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tolerant text match : strict equality OR substring (un sens ou l'autre).
 *
 * Pourquoi : les expected_text_answers du prof sont souvent une phrase
 * canonique courte ("la mise à plat de la forme"). Les élèves répondent
 * en variantes étendues ou simplifiées ("la mise a plat de toutes les
 * faces d'un solide", "mise à plat de la forme", etc.).
 *
 * Sans tolérance, le grading rejette à tort ces réponses. Avec substring
 * bidirectionnel :
 * - "la mise a plat" (court) match "la mise à plat de la forme" (expected)
 * - "la mise à plat de la forme du solide" (long) match aussi
 *
 * Risque : faux positifs si l'expected est très court (e.g. "oui").
 * Garde-fou : on n'applique la substring que si l'expected a au moins
 * 3 mots, sinon strict equality (pour éviter de matcher des réponses
 * accidentellement par contenir "oui" dans "non oui").
 */
function textMatch(studentNorm: string, expectedNorm: string): boolean {
  if (studentNorm === expectedNorm) return true;
  const expectedWordCount = expectedNorm.split(" ").length;
  if (expectedWordCount < 3) return false;
  return studentNorm.includes(expectedNorm) || expectedNorm.includes(studentNorm);
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
      if (studentNorm.length === 0) return { is_correct: false };
      const matched = question.expected_text_answers
        .map(normalize)
        .some((expectedNorm) => textMatch(studentNorm, expectedNorm));
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
