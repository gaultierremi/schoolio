import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 6;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

async function uniqueCode(admin: ReturnType<typeof createAdminClient>, excludeClassId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { count } = await admin
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("invite_code", code)
      .neq("id", excludeClassId);
    if ((count ?? 0) === 0) return code;
  }
  throw new Error("Impossible de générer un code unique");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .single();

    if (!existing) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const invite_code = await uniqueCode(admin, params.id);

    const { data, error } = await admin
      .from("classes")
      .update({ invite_code })
      .eq("id", params.id)
      .select("invite_code")
      .single();

    if (error) throw error;

    return NextResponse.json({ invite_code: data.invite_code });
  } catch (err) {
    console.error("[regenerate-code:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
