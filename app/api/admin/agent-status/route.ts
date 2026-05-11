import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiOk, apiError, safeError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["working", "planning", "blocked", "idle", "done"] as const;
type AgentStatusValue = (typeof VALID_STATUSES)[number];

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/agent-status
// Returns all agent rows sorted by name. Any authenticated user can read.
export async function GET() {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("agent_status")
      .select("id, name, emoji, status, current_task, branch, eta, updated_at")
      .order("name", { ascending: true });

    if (error) throw error;

    return apiOk(data ?? []);
  } catch (err) {
    return safeError(err, "admin/agent-status:GET");
  }
}

// POST /api/admin/agent-status
// Updates a single agent row identified by name.
// Uses service_role client to bypass the RLS write block on authenticated.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as Record<string, unknown>;

    // Validate name
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return apiError("Le champ 'name' (string) est requis", 400);
    }
    const name = body.name.trim();
    if (name.length > 20) {
      return apiError("'name' dépasse 20 caractères", 400);
    }

    // Validate status
    if (!VALID_STATUSES.includes(body.status as AgentStatusValue)) {
      return apiError(
        `'status' invalide — valeurs acceptées : ${VALID_STATUSES.join(", ")}`,
        400,
      );
    }
    const status = body.status as AgentStatusValue;

    // Validate optional fields
    if (body.current_task !== undefined && body.current_task !== null) {
      if (typeof body.current_task !== "string" || body.current_task.length > 200) {
        return apiError("'current_task' doit être une string ≤ 200 caractères", 400);
      }
    }
    if (body.branch !== undefined && body.branch !== null) {
      if (typeof body.branch !== "string" || body.branch.length > 100) {
        return apiError("'branch' doit être une string ≤ 100 caractères", 400);
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
        current_task: (body.current_task as string | null | undefined) ?? null,
        branch: (body.branch as string | null | undefined) ?? null,
        eta: (body.eta as string | null | undefined) ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("name", name)
      .select("id, name, emoji, status, current_task, branch, eta, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!updated) return apiError(`Agent '${name}' introuvable`, 404);

    return apiOk({ updated });
  } catch (err) {
    return safeError(err, "admin/agent-status:POST");
  }
}
