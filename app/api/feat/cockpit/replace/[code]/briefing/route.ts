import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { routeAIRequest } from "@/lib/ai-router";
import { DEMO_PDFS } from "@/lib/cockpit/session";
import { MOCK_STUDENTS } from "@/types/post-course";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CODE_RE = /^[0-9]{6}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET → return (or generate) the briefing IA for this replacement code
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code)) {
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  }

  try {
    const { data: absence } = await admin()
      .from("absences")
      .select("*")
      .eq("replacement_code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (!absence) return NextResponse.json({ error: "Code introuvable ou expiré" }, { status: 404 });

    // Return cached briefing if available
    if (absence.briefing_cache) {
      return NextResponse.json({ briefing: absence.briefing_cache, cached: true });
    }

    // Build context from last sessions (for POC, we mock the session history)
    const { data: recentSessions } = await admin()
      .from("cockpit_sessions")
      .select("transcript, current_page, pdf_key, started_at")
      .eq("is_active", false)
      .not("transcript", "eq", "")
      .order("started_at", { ascending: false })
      .limit(3);

    const transcriptContext = (recentSessions ?? [])
      .map((s, i) => {
        const pdf = DEMO_PDFS.find((p) => p.key === s.pdf_key);
        return `Session ${i + 1} (${pdf?.title ?? s.pdf_key}) — Page ${s.current_page} :\n${(s.transcript as string).slice(0, 400)}`;
      })
      .join("\n\n") || "(Pas de sessions précédentes disponibles)";

    const studentProfiles = MOCK_STUDENTS.map(
      (s) => `- ${s.name} (${s.level}) ${s.avatar}`
    ).join("\n");

    const todayPdf = DEMO_PDFS[0]; // Demo: first PDF is "today's course"

    const prompt = `Tu es Maia, co-pilote pédagogique. Tu rédiges un briefing pour un prof remplaçant qui va prendre une classe qu'il ne connaît pas.

CONTEXTE :
- Prof titulaire : ${absence.titulaire_name}
- Cours prévu : ${todayPdf.title} — ${todayPdf.subject}
- Élèves de la classe :
${studentProfiles}
- Notes laissées par le titulaire : "${absence.notes ?? "Aucune note spécifique."}"

HISTORIQUE RÉCENT :
${transcriptContext}

INSTRUCTIONS :
Rédige un briefing structuré en 4 sections (titres ## en markdown).
Sois précis, factuel, bienveillant. Le remplaçant doit pouvoir lire ton briefing en 90 secondes et se sentir PRÊT — pas stressé.
Structure EXACTE :
## Le contexte du cours
## Les élèves à connaître
## Comment le titulaire enseigne
## Ce qu'il faut couvrir aujourd'hui

Max 300 mots. Ton humain, chaleureux, jamais condescendant.`;

    const res = await routeAIRequest("cockpit_replacement_briefing", prompt, {
      maxTokens: 600,
      temperature: 0.5,
    });

    const briefing = res.text.trim();

    // Cache for next calls
    await admin()
      .from("absences")
      .update({ briefing_cache: briefing })
      .eq("replacement_code", code);

    return NextResponse.json({ briefing, cached: false });
  } catch (err) {
    console.error("[cockpit/replace/[code]/briefing:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
