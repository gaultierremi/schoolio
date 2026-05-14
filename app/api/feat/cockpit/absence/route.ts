import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const VALID_REPLACEMENT_NAMES = [
  "Mme Martin",
  "M. Dupont",
  "Mme Lefèvre",
  "Quelqu'un de l'équipe",
] as const;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function generateReplacementCode(): string {
  // 6 chiffres, padding zéros — crypto.randomBytes (rule 9)
  const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
  return String(n).padStart(6, "0");
}

// POST { titulaire_name, start_date, end_date?, replacement_name?, notes? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      titulaire_name?: string;
      start_date?: string;
      end_date?: string | null;
      replacement_name?: string | null;
      notes?: string | null;
    };

    if (typeof body.titulaire_name !== "string" || body.titulaire_name.trim().length < 2 || body.titulaire_name.length > 100) {
      return NextResponse.json({ error: "titulaire_name invalide" }, { status: 400 });
    }
    if (typeof body.start_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
      return NextResponse.json({ error: "start_date invalide (YYYY-MM-DD)" }, { status: 400 });
    }
    if (body.end_date !== undefined && body.end_date !== null &&
        (typeof body.end_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date))) {
      return NextResponse.json({ error: "end_date invalide (YYYY-MM-DD)" }, { status: 400 });
    }
    if (body.notes !== undefined && body.notes !== null &&
        (typeof body.notes !== "string" || body.notes.length > 2000)) {
      return NextResponse.json({ error: "notes trop longues (max 2000)" }, { status: 400 });
    }

    // Generate unique 6-digit code with collision retry
    let record = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReplacementCode();
      const { data, error } = await admin()
        .from("absences")
        .insert({
          replacement_code: code,
          titulaire_name: body.titulaire_name.trim(),
          start_date: body.start_date,
          end_date: body.end_date ?? null,
          replacement_name: body.replacement_name ?? null,
          notes: body.notes ?? null,
        })
        .select("id, replacement_code")
        .single();

      if (!error) { record = data; break; }
      if ((error as { code?: string }).code !== "23505") throw error;
    }

    if (!record) return NextResponse.json({ error: "Impossible de générer un code unique" }, { status: 500 });
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("[cockpit/absence:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// GET ?code=XXXXXX → validate replacement code exists and is active
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code || !/^[0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  }

  try {
    const { data } = await admin()
      .from("absences")
      .select("id, titulaire_name, replacement_name, start_date, end_date, notes, is_active")
      .eq("replacement_code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return NextResponse.json({ error: "Code introuvable ou expiré" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[cockpit/absence:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
