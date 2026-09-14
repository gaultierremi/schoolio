import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * Mini helper inline pour audit_log (Sprint 2A).
 *
 * Le vrai helper `lib/audit/log.ts` vit dans la branche Sprint 1A (PR #74)
 * pas encore mergée sur main. Quand 1A est mergé, refactor ce fichier pour
 * importer `logAuditEvent` depuis `@/lib/audit/log`.
 *
 * Fire-and-forget : ne propage jamais les erreurs (un audit qui échoue ne
 * doit pas casser l'action fonctionnelle).
 */
async function logAuditInline(params: {
  actorId: string;
  actorEmail: string | null;
  actorRole: "student" | "teacher" | "system";
  eventType: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await admin.from("audit_log").insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail,
      actor_role: params.actorRole,
      event_type: params.eventType,
      target_type: params.targetType,
      target_id: params.targetId,
      details: params.details,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit inline] insert failed:", err instanceof Error ? err.message : err);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getRole(appMeta: unknown): "student" | "teacher" | "system" {
  const role = (appMeta as Record<string, unknown>)?.role;
  if (role === "student" || role === "teacher") return role;
  return "system";
}

/**
 * POST /api/curation/[id]/toggle-active
 *
 * Sprint 2A — toggle on/off d'une question (slider de curation simplifié,
 * mémoire `project_curation_concept_view`).
 *
 * Body : { is_active: boolean }
 *
 * Auth :
 * - User authentifié (requireUser via getUser)
 * - Doit être teacher_id de la question (RLS le rejouera, mais on check ici
 *   pour retourner un 403 plus parlant)
 *
 * Action :
 *  - UPDATE teacher_questions SET is_active = ? WHERE id = ? AND teacher_id = user.id
 *  - Log audit (event_type custom 'curation_toggle_active' avec is_active dans details)
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  const role = getRole(user.app_metadata);
  if (role !== "teacher") {
    return NextResponse.json({ ok: false, error: "Réservé aux professeurs" }, { status: 403 });
  }

  if (!UUID_REGEX.test(params.id)) {
    return NextResponse.json({ ok: false, error: "ID question invalide" }, { status: 400 });
  }

  let body: { is_active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "is_active doit être un boolean" },
      { status: 400 },
    );
  }
  const isActive = body.is_active;

  // Update via le client authenticated (RLS s'assure de la propriété teacher_id).
  // Note : on n'utilise pas le service role car RLS suffit ici et c'est l'écriture
  // d'une donnée qui appartient à l'user, pas une opération système.
  // is_active est désormais la porte unique d'assignabilité : activer une
  // question, c'est la diffuser. Ce geste DOIT donc horodater la revue, sinon
  // la question est servie aux élèves tout en restant éternellement dans la
  // file "à relire" du dashboard — le journal mentirait dès le premier clic.
  // Asymétrie voulue : on n'écrit le journal QU'À L'ACTIVATION.
  // Éteindre une question est un geste de DIFFUSION ("pas maintenant"), pas un
  // geste de revue. Effacer validated_at à l'extinction renverrait dans la file
  // "à relire" des questions déjà relues — typiquement un chapitre éteint en
  // septembre et rallumé en mars — et le prof n'aurait aucun moyen d'en sortir
  // sans les rejeter, ce qu'il ne veut pas dire. C'est précisément la confusion
  // entre journal et diffusion que cette PR sépare.
  const reviewJournal = isActive
    ? { validated_at: new Date().toISOString(), rejected_at: null }
    : {};

  const { data: updated, error } = await supabase
    .from("teacher_questions")
    .update({ is_active: isActive, ...reviewJournal })
    .eq("id", params.id)
    .eq("teacher_id", user.id)
    .select("id, is_active")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { ok: false, error: "Impossible de mettre à jour la question (introuvable ou non autorisée)" },
      { status: 404 },
    );
  }

  await logAuditInline({
    actorId: user.id,
    actorEmail: user.email ?? null,
    actorRole: "teacher",
    eventType: "curation_toggle_active",
    targetType: "teacher_question",
    targetId: params.id,
    details: { is_active: isActive },
  });

  return NextResponse.json({ ok: true, is_active: updated.is_active });
}
