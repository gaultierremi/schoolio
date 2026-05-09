import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

type LogActivityParams = {
  event_type: string;
  actor_id?: string | null;
  actor_type: "student" | "teacher" | "system";
  target_type?: string | null;
  target_id?: string | null;
  teacher_id: string;
  context?: Record<string, unknown>;
};

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await admin.from("activity_events").insert({
      event_type: params.event_type,
      actor_id: params.actor_id ?? null,
      actor_type: params.actor_type,
      target_type: params.target_type ?? null,
      target_id: params.target_id ?? null,
      teacher_id: params.teacher_id,
      context: params.context ?? {},
    });
  } catch {
    // Silent — never block business logic
  }
}
