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

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();

    const { data: cls } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!cls) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const { data: memberships, error: membError } = await admin
      .from("class_memberships")
      .select("student_user_id, user_profiles!inner(first_name, last_name)")
      .eq("class_id", params.id)
      .eq("status", "active");

    if (membError) throw membError;

    const members = (memberships ?? []).map((m) => {
      const profile = (m.user_profiles as unknown) as { first_name: string | null; last_name: string | null } | null;
      return {
        student_user_id: m.student_user_id as string,
        student_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Élève",
      };
    });

    if (!members.length) return NextResponse.json([]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: picks } = await admin
      .from("student_random_picks")
      .select("student_user_id, picked_at")
      .eq("class_id", params.id)
      .eq("was_cancelled", false)
      .gte("picked_at", thirtyDaysAgo)
      .order("picked_at", { ascending: false });

    const countMap: Record<string, number> = {};
    const lastPickedMap: Record<string, string> = {};
    for (const p of picks ?? []) {
      const sid = p.student_user_id as string;
      countMap[sid] = (countMap[sid] ?? 0) + 1;
      if (!lastPickedMap[sid]) lastPickedMap[sid] = p.picked_at as string;
    }

    const stats = members
      .map((m) => ({
        student_user_id: m.student_user_id,
        student_name: m.student_name,
        pick_count_30d: countMap[m.student_user_id] ?? 0,
        last_picked_at: lastPickedMap[m.student_user_id] ?? null,
      }))
      .sort((a, b) => a.pick_count_30d - b.pick_count_30d);

    return NextResponse.json(stats);
  } catch (err) {
    console.error("[pick-stats:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
