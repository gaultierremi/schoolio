import { NextRequest, NextResponse } from "next/server";
import { routeAIRequest, GracefulAIError } from "@/lib/ai-router";

export async function POST(req: NextRequest) {
  try {
    const { question, options, answerIndex } = (await req.json()) as {
      question: string;
      options: string[];
      answerIndex: number;
    };

    if (!question?.trim()) {
      return NextResponse.json({ error: "Question manquante" }, { status: 400 });
    }

    const correctAnswer = options?.[answerIndex] ?? "";
    const prompt =
      `Génère une explication pédagogique courte (2-3 phrases) pour cette question de quiz :\n\n` +
      `Question : ${question}\nRéponse correcte : ${correctAnswer}\n\n` +
      `Réponds en français, de façon claire et concise, sans répéter la question ni commencer par "Explication :".`;

    const response = await routeAIRequest("explain_answer", prompt, { maxTokens: 300 });
    return NextResponse.json({ explanation: response.text.trim() });
  } catch (err) {
    if (err instanceof GracefulAIError) {
      return NextResponse.json({ error: "Service IA temporairement indisponible" }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
