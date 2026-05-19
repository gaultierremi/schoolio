import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { requireTeacherPage } from "@/lib/auth/role";
import EleveAssignmentDetail from "../../_components/EleveAssignmentDetail";

export const dynamic = "force-dynamic";

/**
 * Sprint 5 PR S5-1 — Page drill-down élève × devoir (depuis heatmap classe).
 *
 * Server component qui :
 * 1. Vérifie auth prof + ownership classe
 * 2. Fetch via l'API interne pour cohérence (single source of truth)
 * 3. Délègue le rendu au composant client EleveAssignmentDetail
 *
 * URL query : `?concept=<conceptId>` pour scroller à un concept précis
 * (depuis le click sur cellule heatmap).
 */
export default async function EleveAssignmentPage({
  params,
}: {
  params: { id: string; assignmentId: string; studentId: string };
}) {
  const { user } = await requireTeacherPage();

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Vérification ownership classe (early redirect avant de fetch la data)
  const { data: classRow } = await admin
    .from("classes")
    .select("id, teacher_id, name")
    .eq("id", params.id)
    .maybeSingle();

  if (!classRow) notFound();
  if ((classRow as { teacher_id: string }).teacher_id !== user.id) {
    redirect("/accueil");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-6 sm:px-6" lang="fr-BE">
      <nav aria-label="Fil d'Ariane" className="mb-4">
        <Link
          href={`/accueil/classes/${params.id}/devoirs/${params.assignmentId}`}
          className="
            inline-flex items-center gap-1.5 rounded-md text-sm text-slate-600 transition
            hover:text-slate-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:text-slate-400 dark:hover:text-slate-200
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Retour au devoir
        </Link>
      </nav>

      <EleveAssignmentDetail
        classId={params.id}
        assignmentId={params.assignmentId}
        studentId={params.studentId}
      />
    </main>
  );
}
