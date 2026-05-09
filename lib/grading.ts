export type LetterGrade = "A" | "B" | "C" | "D";

export type GradableCompletion = {
  status: string;
  score: number | null;
};

export function computeLetterGrade(completion: GradableCompletion | null | undefined): LetterGrade {
  if (!completion || completion.status === "pending") return "A";
  const score = completion.score !== null ? Number(completion.score) : 0;
  if (score < 50) return "B";
  if (score < 70) return "C";
  return "D";
}

export const GRADE_LABEL: Record<LetterGrade, string> = {
  A: "Non rendu",
  B: "À retravailler",
  C: "Bien",
  D: "Excellent",
};

export const GRADE_STYLE: Record<LetterGrade, string> = {
  A: "border-gray-700 bg-gray-800/60 text-gray-400",
  B: "border-red-800/50 bg-red-950/40 text-red-400",
  C: "border-amber-700/50 bg-amber-950/40 text-amber-400",
  D: "border-green-700/50 bg-green-950/40 text-green-400",
};
