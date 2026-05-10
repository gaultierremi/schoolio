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

// POST /api/admin/beta-whitelist/approve/[request_id]
// Approves a beta access request: adds email to whitelist + marks request approved
export async function POST(
  _req: NextRequest,
  { params }: { params: { request_id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!(ADMIN_EMAILS as readonly string[]).includes(user.email?.toLowerCase() ?? "")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Fetch the request
  const { data: req } = await admin
    .from("beta_access_requests")
    .select("id, email, user_id")
    .eq("id", params.request_id)
    .maybeSingle();

  if (!req) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  const email = req.email.toLowerCase();

  // Add to whitelist (idempotent)
  await admin.from("beta_whitelist").upsert(
    { email, added_by: user.id, source: "approved_request" },
    { onConflict: "email", ignoreDuplicates: true },
  );

  // Mark request as approved
  const { error: updateError } = await admin
    .from("beta_access_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", params.request_id);

  if (updateError) {
    console.error("[approve]", updateError);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}
