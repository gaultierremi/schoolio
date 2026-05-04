export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { getUserMastery } from "@/lib/concepts";

type Recommendation = {
  type: "révision" | "progression" | "défi";
  message: string;
};

export async function GET() {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ recommendations: [] }, { status: 401 });
    }

    let mastery;
    try {
      mastery = await getUserMastery(user.id);
    } catch {
      return NextResponse.json({ recommendations: [] });
    }

    if (mastery.length === 0) {
      return NextResponse.json({ recommendations: [] });
    }

    const masteryText = mastery
      .slice(0, 15)
      .map(
        (m) =>
          `- ${m.concept.name}: ${m.mastery_score}/100 (${m.correct}/${m.attempts} correctes)`
      )
      .join("\n");

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Tu es un coach pédagogique bienveillant. Analyse ces données et génère exactement 3 recommandations courtes et encourageantes en français.

Données de maîtrise:
${masteryText}

Règles:
- type "révision" si score < 40 → dire de retravailler ce concept précis
- type "progression" si score entre 40-70 → encourager la progression sur un concept
- type "défi" si score > 70 → proposer d'aller plus loin

Réponds UNIQUEMENT en JSON valide:
{"recommendations":[{"type":"révision","message":"..."},{"type":"progression","message":"..."},{"type":"défi","message":"..."}]}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ recommendations: [] });

    const parsed = JSON.parse(match[0]) as {
      recommendations?: Recommendation[];
    };

    return NextResponse.json({
      recommendations: parsed.recommendations ?? [],
    });
  } catch (err) {
    console.error("study-recommendations:", err);
    return NextResponse.json({ recommendations: [] });
  }
}
