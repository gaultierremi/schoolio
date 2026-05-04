import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

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

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Génère une explication pédagogique courte (2-3 phrases) pour cette question de quiz :\n\nQuestion : ${question}\nRéponse correcte : ${correctAnswer}\n\nRéponds en français, de façon claire et concise, sans répéter la question ni commencer par "Explication :".`,
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return NextResponse.json({ explanation: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
