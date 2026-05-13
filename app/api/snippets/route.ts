import { NextRequest } from "next/server";
import { requireUser, requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SOURCE_KIND_VALUES = ["concept_definition", "theory_block", "manual_teacher"] as const;
type SourceKind = typeof SOURCE_KIND_VALUES[number];

// ── GET /api/snippets?concept_id=uuid[&source_kind=...] ──────────────────────
// Liste les snippets d'un concept. RLS scope au tenant. Élèves + profs allowed
// (les élèves consomment via le tuteur socratique, les profs pour curation).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const conceptId = req.nextUrl.searchParams.get("concept_id");
    if (typeof conceptId !== "string" || !UUID_RE.test(conceptId)) {
      return apiError("concept_id invalide", 400);
    }

    const sourceKindParam = req.nextUrl.searchParams.get("source_kind");
    let sourceKindFilter: SourceKind | null = null;
    if (sourceKindParam !== null) {
      if (!(SOURCE_KIND_VALUES as readonly string[]).includes(sourceKindParam)) {
        return apiError("source_kind invalide", 400);
      }
      sourceKindFilter = sourceKindParam as SourceKind;
    }

    const supabase = createClient();
    let query = supabase
      .from("content_snippets")
      .select("id, concept_id, text, source_kind, source_ref, created_at, created_by")
      .eq("concept_id", conceptId)
      .order("source_kind", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(200);

    if (sourceKindFilter) {
      query = query.eq("source_kind", sourceKindFilter);
    }

    const { data, error } = await query;
    if (error) {
      await logError(error, {
        source: "api.snippets.GET",
        context: { conceptId, sourceKindFilter },
        userId: auth.user.id,
      });
      return apiError("Lecture des snippets échouée", 500);
    }

    return apiOk({ snippets: data ?? [] });
  } catch (err) {
    await logError(err, { source: "api.snippets.GET" });
    return safeError(err, "snippets:get");
  }
}

// ── POST /api/snippets ───────────────────────────────────────────────────────
// Crée un snippet manual_teacher. Body : { concept_id, text, note? }.
// source_kind est FORCÉ à 'manual_teacher' server-side (Rule 5 : never trust body).
// RLS valide que le concept appartient à la school du prof.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    const body = (await req.json()) as {
      concept_id?: unknown;
      text?: unknown;
      note?: unknown;
    };

    if (typeof body.concept_id !== "string" || !UUID_RE.test(body.concept_id)) {
      return apiError("concept_id invalide", 400);
    }
    if (typeof body.text !== "string" || body.text.length < 20 || body.text.length > 4000) {
      return apiError("text doit faire entre 20 et 4000 caractères", 400);
    }
    let note: string | undefined;
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== "string" || body.note.length > 500) {
        return apiError("note doit être une chaîne ≤ 500 caractères", 400);
      }
      note = body.note;
    }

    // Verify the target concept belongs to the auth'd school (defense in
    // depth on top of RLS WITH CHECK — gives a 403 instead of an opaque RLS
    // error when the prof tries to annotate another school's concept).
    const { data: concept, error: cErr } = await supabase
      .from("concepts")
      .select("id, school_id")
      .eq("id", body.concept_id)
      .maybeSingle();

    if (cErr) {
      await logError(cErr, {
        source: "api.snippets.POST",
        context: { conceptId: body.concept_id },
        userId: auth.user.id,
        schoolId,
      });
      return apiError("Vérification du concept échouée", 500);
    }
    if (!concept || concept.school_id !== schoolId) {
      return apiError("Concept introuvable", 404);
    }

    const sourceRef = note ? { note } : {};

    const { data, error } = await supabase
      .from("content_snippets")
      .insert({
        concept_id: body.concept_id,
        school_id: schoolId,
        text: body.text,
        source_kind: "manual_teacher" satisfies SourceKind,
        source_ref: sourceRef,
        created_by: auth.user.id,
      })
      .select("id, concept_id, text, source_kind, source_ref, created_at, created_by")
      .single();

    if (error || !data) {
      await logError(error, {
        source: "api.snippets.POST",
        context: { conceptId: body.concept_id, schoolId },
        userId: auth.user.id,
        schoolId,
      });
      return apiError("Création du snippet échouée", 500);
    }

    return apiOk({ snippet: data }, 201);
  } catch (err) {
    await logError(err, { source: "api.snippets.POST" });
    return safeError(err, "snippets:post");
  }
}
