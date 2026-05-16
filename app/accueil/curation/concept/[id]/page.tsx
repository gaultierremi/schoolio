import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacherPage } from "@/lib/auth/role";
import { createClient } from "@/lib/supabase-server";
import ConceptEditor from "./ConceptEditor";
import type { ConceptEditorData } from "./types";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vue concept unifiée prof (Sprint 2B PR B).
 *
 * Server fetcher : 5 requêtes en parallèle pour minimiser le TTFB.
 *
 * Sécurité :
 * - `requireTeacherPage()` enforce le rôle teacher (redirect /accueil sinon)
 * - On revalide manuellement que le concept appartient au tenant du prof
 *   (RLS le ferait aussi mais on veut un notFound() explicite, pas un 500)
 *
 * Cf. mémoire `project_curation_concept_view`.
 */
export default async function ConceptPage({
  params,
}: {
  params: { id: string };
}) {
  await requireTeacherPage();

  if (!UUID_REGEX.test(params.id)) {
    notFound();
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Service-role client pour bypass RLS sur les jointures qu'on fait soi-même.
  // On filtre school_id manuellement pour rester tenant-safe.
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Profil pour récupérer school_id (tenant scope)
  const { data: profile } = await admin
    .from("user_profiles")
    .select("school_id")
    .eq("id", user.id)
    .maybeSingle();
  const schoolId = (profile as { school_id?: string } | null)?.school_id;
  if (!schoolId) redirect("/onboarding");

  // 2. 5 fetches parallèles (Promise.all minimise TTFB)
  const [conceptRes, theoryRes, questionsRes, misconceptionsRes] =
    await Promise.all([
      admin
        .from("concepts")
        .select("id, name, slug, description, source_quote, source_concept_path, program_id, uaa_id, school_id")
        .eq("id", params.id)
        .maybeSingle(),
      admin
        .from("theory_blocks")
        .select("id, paragraph_ordinal, section_kind, content, updated_at, approved_at")
        .eq("concept_id", params.id)
        .order("paragraph_ordinal", { ascending: true }),
      admin
        .from("teacher_questions")
        .select("id, type, question, is_active, validated_at, rejected_at, difficulty_stars, created_at")
        .eq("concept_id", params.id)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("concept_misconceptions")
        .select("id, label, ordinal, created_at, updated_at")
        .eq("concept_id", params.id)
        .order("ordinal", { ascending: true }),
    ]);

  const concept = conceptRes.data as ConceptEditorData["concept"] | null;
  if (!concept) notFound();
  if (concept.school_id !== schoolId) notFound();

  const data: ConceptEditorData = {
    concept,
    theoryBlocks: (theoryRes.data as ConceptEditorData["theoryBlocks"] | null) ?? [],
    questions: (questionsRes.data as ConceptEditorData["questions"] | null) ?? [],
    misconceptions:
      (misconceptionsRes.data as ConceptEditorData["misconceptions"] | null) ?? [],
  };

  return <ConceptEditor initialData={data} />;
}
