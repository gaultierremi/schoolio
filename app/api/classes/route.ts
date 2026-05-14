import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity/log";

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
      .select("id, name, level, subject, auth_mode, invite_code, parent_class_id, archived_at, created_at")
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

    // classes.school_id est NOT NULL via la migration multi-tenant
    // (20260513140100 + 20260513160000_seed_foundertestground). Le route
    // handler ne l'incluait pas dans l'insert — bug 500 corrigé ici.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = profile?.school_id as string | null | undefined;
    if (!schoolId) {
      return NextResponse.json({ error: "Aucune école associée à ton compte" }, { status: 403 });
    }

    const body = await req.json() as {
      name?: string;
      level?: string | null;
      subject?: string | null;
      parent_class_id?: string | null;
    };

    const name = (body.name ?? "").trim();
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Nom de classe invalide (2–80 caractères)" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Validation parent_class_id : si fourni, doit être une cohorte (parent_class_id NULL)
    // de la même école, owned par le même prof (anti cross-tenant).
    let parentClassId: string | null = null;
    if (body.parent_class_id !== undefined && body.parent_class_id !== null) {
      if (typeof body.parent_class_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.parent_class_id)) {
        return NextResponse.json({ error: "parent_class_id invalide" }, { status: 400 });
      }
      const { data: parent } = await admin
        .from("classes")
        .select("id, teacher_id, school_id, parent_class_id")
        .eq("id", body.parent_class_id)
        .maybeSingle();
      if (!parent) {
        return NextResponse.json({ error: "Cohorte parente introuvable" }, { status: 404 });
      }
      const p = parent as { teacher_id: string; school_id: string; parent_class_id: string | null };
      if (p.school_id !== schoolId) {
        return NextResponse.json({ error: "Cohorte parente d'une autre école" }, { status: 403 });
      }
      if (p.parent_class_id !== null) {
        return NextResponse.json({ error: "On ne peut pas créer une sous-classe sous une sous-classe (profondeur max 1)" }, { status: 400 });
      }
      parentClassId = p.teacher_id === user.id ? body.parent_class_id : body.parent_class_id;
      // Note : on autorise d'utiliser la cohorte d'un autre prof de la même école
      // pour permettre plusieurs profs de matières de se rattacher au même groupe-année.
    }

    const invite_code = await uniqueCode(admin);

    const { data: newClass, error } = await admin
      .from("classes")
      .insert({
        teacher_id: user.id,
        school_id: schoolId,
        name,
        level: body.level ?? null,
        subject: body.subject ?? null,
        auth_mode: "full",
        invite_code,
        parent_class_id: parentClassId,
      })
      .select("id, name, level, subject, auth_mode, invite_code, invite_link_token, parent_class_id, archived_at, created_at")
      .single();

    if (error) throw error;

    await logActivity({
      event_type: "teacher_created_class",
      actor_id: user.id,
      actor_type: "teacher",
      target_type: "class",
      target_id: (newClass as { id: string }).id,
      teacher_id: user.id,
      context: { name },
    });

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (err) {
    console.error("[classes:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
