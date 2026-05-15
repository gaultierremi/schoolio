import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { PIN_COOKIE_NAME } from "@/lib/auth/pin-cookie";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * DELETE /api/auth/pin
 *
 * "PIN oublié" → supprime la row user_pin du user, retire le flag
 * app_metadata.has_pin, clear le cookie. Le client appelle ensuite
 * supabase.auth.signOut() pour forcer un nouveau SSO complet.
 *
 * Le user pourra ensuite setup un nouveau PIN via /onboarding/pin-setup.
 */
export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Delete user_pin row
  await admin.from("user_pin").delete().eq("user_id", user.id);

  // Clear app_metadata.has_pin (middleware will redirect to pin-setup au next login)
  const nextAppMeta: Record<string, unknown> = { ...(user.app_metadata ?? {}) };
  delete nextAppMeta.has_pin;
  await admin.auth.admin.updateUserById(user.id, { app_metadata: nextAppMeta });

  // Clear cookie
  cookies().delete(PIN_COOKIE_NAME);

  const role =
    (user.app_metadata as Record<string, unknown>)?.role === "student"
      ? "student"
      : (user.app_metadata as Record<string, unknown>)?.role === "teacher"
        ? "teacher"
        : "system";
  await logAuditEvent({
    actorId: user.id,
    actorEmail: user.email ?? null,
    actorRole: role,
    eventType: AUDIT_EVENTS.PIN_RESET,
  });

  return NextResponse.json({ ok: true });
}
