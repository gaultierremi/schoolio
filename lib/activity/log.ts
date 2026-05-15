import { withAdminClient } from "@/lib/db/admin-client";

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
    await withAdminClient(async (admin) => {
      await admin.from("activity_events").insert({
        event_type: params.event_type,
        actor_id: params.actor_id ?? null,
        actor_type: params.actor_type,
        target_type: params.target_type ?? null,
        target_id: params.target_id ?? null,
        teacher_id: params.teacher_id,
        context: params.context ?? {},
      });
    });
  } catch {
    // Silent — never block business logic
  }
}
