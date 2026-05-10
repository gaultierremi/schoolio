import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { ADMIN_EMAILS } from "@/lib/admin-config";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function assertAdmin(): Promise<{ userId: string; email: string } | NextResponse> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const email = user.email?.toLowerCase() ?? "";
  if (!(ADMIN_EMAILS as readonly string[]).includes(email)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  return { userId: user.id, email };
}

// GET — fetch all whitelist + pending requests + history
export async function GET() {
  const auth = await assertAdmin();
  if (auth instanceof NextResponse) return auth;

  const admin = createAdminClient();

  const [whitelistRes, pendingRes, historyRes] = await Promise.all([
    admin
      .from("beta_whitelist")
      .select("id, email, added_at, source, notes")
      .order("added_at", { ascending: false }),

    admin
      .from("beta_access_requests")
      .select("id, email, full_name, message, requested_at, status")
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),

    admin
      .from("beta_access_requests")
      .select("id, email, full_name, message, requested_at, reviewed_at, status")
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    whitelist: whitelistRes.data ?? [],
    pending_requests: pendingRes.data ?? [],
    history: historyRes.data ?? [],
  });
}

// POST — add email to whitelist manually
export async function POST(req: NextRequest) {
  const auth = await assertAdmin();
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth as { userId: string; email: string };
  const body = (await req.json()) as { email?: string; notes?: string };
  const email = body.email?.toLowerCase().trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin.from("beta_whitelist").insert({
    email,
    notes: body.notes?.trim() || null,
    added_by: userId,
    source: "manual",
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Email déjà whitelisté" }, { status: 409 });
    }
    console.error("[admin/beta-whitelist:POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
