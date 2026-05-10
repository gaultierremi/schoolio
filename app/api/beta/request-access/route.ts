import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const email = user.email?.toLowerCase() ?? "";
    const body = (await req.json().catch(() => ({}))) as { message?: string };
    const admin = createAdminClient();

    // Already in whitelist?
    const { data: whitelist } = await admin
      .from("beta_whitelist")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (whitelist) {
      return NextResponse.json({ already_approved: true });
    }

    // Existing pending request?
    const { data: pending } = await admin
      .from("beta_access_requests")
      .select("id, status, requested_at")
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (pending) {
      return NextResponse.json({ already_pending: true });
    }

    // Rejected request: allow re-request after 30 days
    const { data: rejected } = await admin
      .from("beta_access_requests")
      .select("id, requested_at")
      .ilike("email", email)
      .eq("status", "rejected")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rejected) {
      const daysSince =
        (Date.now() - new Date(rejected.requested_at).getTime()) / 86400000;
      if (daysSince < 30) {
        return NextResponse.json(
          { error: "Tu peux soumettre une nouvelle demande dans " + Math.ceil(30 - daysSince) + " jours." },
          { status: 429 },
        );
      }
    }

    // Full name from auth metadata
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const full_name =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      null;

    const { error: insertError } = await admin
      .from("beta_access_requests")
      .insert({
        user_id: user.id,
        email,
        full_name,
        message: body.message?.trim() || null,
        status: "pending",
      });

    if (insertError) {
      console.error("[beta/request-access]", insertError);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[beta/request-access]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
