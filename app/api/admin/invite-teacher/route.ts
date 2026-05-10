import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";

export const dynamic = "force-dynamic";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[admin/invite-teacher]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userEmail = user.email?.toLowerCase() ?? "";
    if (!(SUPER_ADMIN_EMAILS as readonly string[]).includes(userEmail)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: existingTeacher, error: selectError } = await admin
      .from("school_teachers")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existingTeacher) {
      return NextResponse.json({ success: true, alreadyExists: true });
    }

    const { error: insertError } = await admin
      .from("school_teachers")
      .insert({ email });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, alreadyExists: false, email });
  } catch (error) {
    console.error("[admin/invite-teacher]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
