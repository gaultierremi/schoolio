import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { apiOk, apiError, safeError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["working", "planning", "blocked", "idle", "done"] as const;
type AgentStatus = (typeof VALID_STATUSES)[number];

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-mc-secret");
  const expected = process.env.MC_SHARED_SECRET;

  if (!expected) {
    console.error("[mc/update] MC_SHARED_SECRET non configuré côté serveur");
    return apiError("Service non configuré", 503);
  }
  if (!secret || secret !== expected) {
    return apiError("Non autorisé", 401);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    if (typeof body.agent !== "string" || body.agent.trim().length === 0) {
      return apiError("'agent' (string) est requis", 400);
    }
    const agent = body.agent.trim();
    if (agent.length > 20) {
      return apiError("'agent' dépasse 20 caractères", 400);
    }

    if (!VALID_STATUSES.includes(body.status as AgentStatus)) {
      return apiError(
        `'status' invalide — valeurs acceptées : ${VALID_STATUSES.join(", ")}`,
        400,
      );
    }
    const status = body.status as AgentStatus;

    if (body.task !== undefined && body.task !== null) {
      if (typeof body.task !== "string" || body.task.length > 200) {
        return apiError("'task' doit être une string ≤ 200 caractères", 400);
      }
    }
    if (body.eta !== undefined && body.eta !== null) {
      if (typeof body.eta !== "string" || body.eta.length > 50) {
        return apiError("'eta' doit être une string ≤ 50 caractères", 400);
      }
    }

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("agent_status")
      .update({
        status,
        current_task: (body.task as string | null | undefined) ?? null,
        eta: (body.eta as string | null | undefined) ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("name", agent)
      .select("id, name, emoji, status, current_task, eta, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!updated) return apiError(`Agent '${agent}' introuvable`, 404);

    return apiOk({ updated });
  } catch (err) {
    return safeError(err, "mc/update:POST");
  }
}
