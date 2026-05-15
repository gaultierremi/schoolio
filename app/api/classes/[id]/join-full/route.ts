import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { logActivity } from "@/lib/activity/log";

export const dynamic = "force-dynamic";

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

type JoinFullBody = {
  email?: unknown;
  password?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as JoinFullBody;

    const email =
      typeof body.email === "string" ? body.email.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";
    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : "";

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Tous les champs sont requis" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Mot de passe trop court (8 caractères minimum)" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: cls, error: clsError } = await admin
      .from("classes")
      .select("archived_at, teacher_id")
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

    const { data: userData, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "student",
          auth_mode: "full",
          firstName,
          lastName,
        },
      });

    if (createError) {
      const msg = createError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("email")) {
        return NextResponse.json(
          { error: "Cette adresse email est déjà utilisée" },
          { status: 409 }
        );
      }
      throw createError;
    }

    const userId = userData.user.id;

    await Promise.all([
      admin.from("user_profiles").upsert({
        id: userId,
        user_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        avatar_color: "#a855f7",
        streak: 0,
        total_games: 0,
        total_score: 0,
        role: "student",
        auth_mode: "full",
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
        context: { auth_mode: "full" },
      });
    }

    return NextResponse.json({ redirectUrl: "/accueil" });
  } catch (err) {
    console.error("[join-full:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
