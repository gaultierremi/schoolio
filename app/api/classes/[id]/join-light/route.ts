import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import crypto from "crypto";
import { logActivity } from "@/lib/activity/log";

export const dynamic = "force-dynamic";

const PSEUDO_PATTERN = /^[\p{L}\p{N} _-]+$/u;
const NAME_PATTERN = /^[\p{L} -]+$/u;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function createRouteHandlerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

function syntheticEmail(pseudo: string, classId: string): string {
  const slug = pseudo.toLowerCase().replace(/[^\w]/g, "-");
  const rand = crypto.randomBytes(3).toString("hex");
  const classShort = classId.replace(/-/g, "").slice(0, 8);
  return `${slug}-${rand}@class-${classShort}.schoolio.local`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { pseudo?: unknown; firstName?: unknown; lastName?: unknown };
    const pseudo =
      typeof body.pseudo === "string" ? body.pseudo.trim() : "";
    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : "";

    if (pseudo.length < 2 || pseudo.length > 20) {
      return NextResponse.json(
        { error: "Le pseudo doit contenir entre 2 et 20 caractères" },
        { status: 400 }
      );
    }
    if (!PSEUDO_PATTERN.test(pseudo)) {
      return NextResponse.json(
        {
          error:
            "Utilise seulement des lettres, chiffres, espaces, tirets ou underscores",
        },
        { status: 400 }
      );
    }
    if (firstName.length < 2 || !NAME_PATTERN.test(firstName)) {
      return NextResponse.json(
        { error: "Prénom invalide (min 2 caractères, lettres uniquement)" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: cls, error: clsError } = await admin
      .from("classes")
      .select("auth_mode, archived_at, teacher_id")
      .eq("id", params.id)
      .maybeSingle();

    if (clsError) throw clsError;
    if (!cls) {
      return NextResponse.json(
        { error: "Classe introuvable" },
        { status: 404 }
      );
    }
    if (cls.archived_at) {
      return NextResponse.json(
        { error: "Classe archivée" },
        { status: 410 }
      );
    }
    if (cls.auth_mode !== "light") {
      return NextResponse.json(
        { error: "Cette classe utilise le mode compte complet" },
        { status: 400 }
      );
    }

    // Check for existing user with this pseudo in this class
    const { data: existing } = await admin
      .from("class_memberships")
      .select("student_user_id, user_profiles!inner(pseudo)")
      .eq("class_id", params.id)
      .eq("user_profiles.pseudo", pseudo)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      // Reconnection: don't overwrite firstName/lastName, just restore session
      const { data: authUser, error: fetchError } =
        await admin.auth.admin.getUserById(existing.student_user_id);
      if (fetchError || !authUser.user) throw fetchError ?? new Error("User not found");

      const { data: linkData, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: authUser.user.email!,
        });
      if (linkError) throw linkError;

      const hashedToken = linkData.properties.hashed_token;
      const supabase = createRouteHandlerClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: hashedToken,
      });
      if (verifyError) throw verifyError;

      if (cls && typeof cls.teacher_id === "string") {
        await logActivity({
          event_type: "student_joined_class",
          actor_id: existing.student_user_id as string,
          actor_type: "student",
          target_type: "class",
          target_id: params.id,
          teacher_id: cls.teacher_id,
          context: { auth_mode: "light", is_reconnect: true },
        });
      }

      return NextResponse.json({ redirectUrl: "/student" });
    }

    // New user: create synthetic account
    const email = syntheticEmail(pseudo, params.id);
    const password = crypto.randomBytes(32).toString("hex");

    const { data: userData, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "student",
          auth_mode: "light",
          pseudo,
          class_id: params.id,
        },
      });

    if (createError) throw createError;

    const userId = userData.user.id;

    await Promise.all([
      admin.from("user_profiles").upsert({
        id: userId,
        user_name: pseudo,
        first_name: firstName,
        last_name: lastName || null,
        avatar_color: "#a855f7",
        unlocked_skins: ["default"],
        active_skin: "default",
        streak: 0,
        total_games: 0,
        total_score: 0,
        role: "student",
        auth_mode: "light",
        pseudo,
      }),
      admin.from("class_memberships").insert({
        class_id: params.id,
        student_user_id: userId,
        status: "active",
      }),
    ]);

    const supabase = createRouteHandlerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;

    if (cls && typeof cls.teacher_id === "string") {
      await logActivity({
        event_type: "student_joined_class",
        actor_id: userId,
        actor_type: "student",
        target_type: "class",
        target_id: params.id,
        teacher_id: cls.teacher_id,
        context: { auth_mode: "light" },
      });
    }

    return NextResponse.json({ redirectUrl: "/student" });
  } catch (err) {
    console.error("[join-light:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
