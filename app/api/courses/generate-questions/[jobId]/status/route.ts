import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/courses/generate-questions/[jobId]/status
// Retourne l'état courant d'un job de génération pour polling client (UX
// substeps + ETA dans /school/import). Auth requireUser + check ownership
// teacher_id.
export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    if (!UUID_RE.test(params.jobId)) {
      return NextResponse.json({ error: "jobId invalide" }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: job, error } = await admin()
      .from("question_generation_jobs")
      .select("id, status, phase, total_target, worker_count, workers_completed, questions_raw, questions_inserted, pages_count, page_range_start, page_range_end, started_at, phase_changed_at, completed_at, error_message, teacher_id, text_chapters_total, text_chapters_completed, image_batches_total, image_batches_completed")
      .eq("id", params.jobId)
      .maybeSingle();

    if (error) {
      console.error("[generate-questions/status]", error);
      return NextResponse.json({ error: "Erreur de lecture du job" }, { status: 500 });
    }
    if (!job) return NextResponse.json({ error: "Job introuvable" }, { status: 404 });

    if ((job as { teacher_id: string }).teacher_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Strip teacher_id de la réponse (interne)
    const { teacher_id: _t, ...rest } = job as Record<string, unknown> & { teacher_id: string };
    void _t;
    return NextResponse.json(rest);
  } catch (err) {
    console.error("[generate-questions/status]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
