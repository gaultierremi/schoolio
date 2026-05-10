export type ListenPromptParams = {
  transcript: string;
  subject: string;
  level: string;
  courseTitle: string;
  currentPage: number | null;
  recentConcepts?: string[];
};

export type ListenQuestion = {
  question: string;
  type: "mcq" | "truefalse";
  options: string[];
  answer_index: number;
  explanation: string;
};

export type ListenPromptResponse = {
  concepts: string[];
  questions: ListenQuestion[];
};

export function buildListenPrompt(params: ListenPromptParams): string {
  const { transcript, subject, level, courseTitle, currentPage, recentConcepts } = params;

  const contextLines: string[] = [
    `Matière : ${subject}`,
    `Niveau : ${level}`,
    `Titre du cours : ${courseTitle}`,
  ];
  if (currentPage !== null) contextLines.push(`Page actuellement projetée : ${currentPage}`);
  if (recentConcepts && recentConcepts.length > 0) {
    contextLines.push(`Concepts récemment évoqués : ${recentConcepts.join(", ")}`);
  }

  return `Tu es un assistant pédagogique expert. Voici le contexte du cours en cours :

${contextLines.join("\n")}

Transcription brute de la parole du professeur (90 dernières secondes, générée par Web Speech API — peut contenir des erreurs de reconnaissance vocale sur les termes techniques) :
"""
${transcript.trim()}
"""

Ta tâche :
1. Identifie 1 à 3 concepts-clés abordés dans cette transcription. Corrige mentalement les erreurs de transcription en t'appuyant sur la matière, le niveau et le titre du cours.
2. Génère exactement 3 questions pédagogiques pour vérifier la compréhension des élèves :
   - Au moins 1 question de type "application" (mise en pratique du concept, pas simple restitution).
   - Si pertinent, alterne entre QCM (4 options, champ "type": "mcq") et Vrai/Faux (2 options : ["Vrai", "Faux"], champ "type": "truefalse"). Utilise Vrai/Faux seulement pour des affirmations claires et non ambiguës.
   - Les questions doivent être adaptées au niveau ${level} et à la matière ${subject}.
   - Chaque question doit avoir une explication concise de la bonne réponse.

Réponds UNIQUEMENT avec ce JSON valide, sans markdown ni texte autour :
{
  "concepts": ["concept1", "concept2"],
  "questions": [
    {
      "question": "Énoncé de la question",
      "type": "mcq",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer_index": 0,
      "explanation": "Explication courte de la bonne réponse"
    },
    {
      "question": "Affirmation vraie ou fausse",
      "type": "truefalse",
      "options": ["Vrai", "Faux"],
      "answer_index": 0,
      "explanation": "Explication courte"
    }
  ]
}`;
}
