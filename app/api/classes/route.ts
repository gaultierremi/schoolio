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

async function uniqueCode(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { count } = await admin
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("invite_code", code);
    if ((count ?? 0) === 0) return code;
  }
  throw new Error("Impossible de générer un code unique");
}

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: classes, error } = await admin
      .from("classes")
      .select("id, name, level, subject, auth_mode, invite_code, archived_at, created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const classIds = (classes ?? []).map((c) => c.id);
    const memberCounts: Record<string, number> = {};
    if (classIds.length > 0) {
      const { data: rows } = await admin
        .from("class_memberships")
        .select("class_id")
        .in("class_id", classIds)
        .eq("status", "active");
      for (const row of rows ?? []) {
        memberCounts[row.class_id] = (memberCounts[row.class_id] ?? 0) + 1;
      }
    }

    const result = (classes ?? []).map((c) => ({
      ...c,
      member_count: memberCounts[c.id] ?? 0,
    }));

    return NextResponse.json({ classes: result });
  } catch (err) {
    console.error("[classes:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await req.json() as {
      name?: string;
      level?: string | null;
      subject?: string | null;
      auth_mode?: string;
    };

    const name = (body.name ?? "").trim();
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Nom de classe invalide (2–80 caractères)" }, { status: 400 });
    }

    const admin = createAdminClient();
    const invite_code = await uniqueCode(admin);

    const { data: newClass, error } = await admin
      .from("classes")
      .insert({
        teacher_id: user.id,
        name,
        level: body.level ?? null,
        subject: body.subject ?? null,
        auth_mode: body.auth_mode === "light" ? "light" : "full",
        invite_code,
      })
      .select("id, name, level, subject, auth_mode, invite_code, invite_link_token, archived_at, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (err) {
    console.error("[classes:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
