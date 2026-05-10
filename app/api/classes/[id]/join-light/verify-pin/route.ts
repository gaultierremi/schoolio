import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { logActivity } from "@/lib/activity/log";
import { verifyReconnectPin } from "@/lib/api/pin";

export const dynamic = "force-dynamic";

function adminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function routeHandlerClient() {
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
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await req.json()) as { pseudo?: unknown; pin?: unknown };
    const pseudo = typeof body.pseudo === "string" ? body.pseudo.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";

    if (!pseudo) {
      return NextResponse.json({ error: "Pseudo manquant" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN invalide (6 chiffres)" }, { status: 400 });
    }

    const admin = adminClient();

    const { data: cls, error: clsError } = await admin
      .from("classes")
      .select("auth_mode, archived_at, teacher_id")
      .eq("id", params.id)
      .maybeSingle();
    if (clsError) throw clsError;
    if (!cls) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
    if (cls.archived_at) return NextResponse.json({ error: "Classe archivée" }, { status: 410 });
    if (cls.auth_mode !== "light") {
      return NextResponse.json({ error: "Mode incompatible" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("class_memberships")
      .select("student_user_id, user_profiles!inner(pseudo, reconnect_pin_hash)")
      .eq("class_id", params.id)
      .eq("user_profiles.pseudo", pseudo)
      .eq("status", "active")
      .maybeSingle();

    // Generic error message for both "user not found" and "wrong PIN" to
    // avoid leaking whether the pseudo exists.
    const genericFail = NextResponse.json(
      { error: "Pseudo ou PIN incorrect" },
      { status: 401 },
    );

    if (!existing) return genericFail;

    const profile = existing.user_profiles as unknown as {
      pseudo: string;
      reconnect_pin_hash: string | null;
    } | null;
    if (!profile?.reconnect_pin_hash) return genericFail;
    if (!verifyReconnectPin(pin, profile.reconnect_pin_hash)) return genericFail;

    // PIN ok: complete the sign-in via the magic-link mechanism.
    const { data: authUser, error: fetchError } =
      await admin.auth.admin.getUserById(existing.student_user_id);
    if (fetchError || !authUser.user) throw fetchError ?? new Error("User not found");

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email!,
    });
    if (linkError) throw linkError;

    const supabase = routeHandlerClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (verifyError) throw verifyError;

    if (typeof cls.teacher_id === "string") {
      await logActivity({
        event_type: "student_joined_class",
        actor_id: existing.student_user_id as string,
        actor_type: "student",
        target_type: "class",
        target_id: params.id,
        teacher_id: cls.teacher_id,
        context: { auth_mode: "light", is_reconnect: true, pin_verified: true },
      });
    }

    return NextResponse.json({ redirectUrl: "/student" });
  } catch (err) {
    console.error("[join-light/verify-pin:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
