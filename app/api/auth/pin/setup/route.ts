import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { hashPin, isValidPinFormat } from "@/lib/auth/pin";
import { signPinUnlockCookie, PIN_COOKIE_NAME } from "@/lib/auth/pin-cookie";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * POST /api/auth/pin/setup
 *
 * Body : { pin: string (4 chiffres), timezone: string (IANA), next?: string }
 *
 * Action :
 *  1. Valide auth + format PIN
 *  2. Hash bcrypt cost 12
 *  3. UPSERT user_pin avec last_unlock_at = NOW(), failed_attempts = 0
 *  4. Met à jour app_metadata.has_pin = true (lecture future par middleware)
 *  5. Émet le cookie HttpOnly signé (TTL 24h)
 *  6. Log audit PIN_SETUP
 *  7. Retourne { ok: true, redirectTo }
 */
export async function POST(request: Request) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  // ── 2. Validate body ──────────────────────────────────────────────────────
  let body: { pin?: unknown; timezone?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (typeof body.pin !== "string" || !isValidPinFormat(body.pin)) {
    return NextResponse.json(
      { ok: false, error: "Le PIN doit être exactement 4 chiffres" },
      { status: 400 },
    );
  }
  const pin = body.pin;

  const timezone =
    typeof body.timezone === "string" && body.timezone.length > 0
      ? body.timezone
      : "Europe/Brussels";

  const nextParam =
    typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/accueil";

  // ── 3. Hash + UPSERT ──────────────────────────────────────────────────────
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let pinHash: string;
  try {
    pinHash = await hashPin(pin);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Format PIN invalide" },
      { status: 400 },
    );
  }

  const { error: upsertError } = await admin.from("user_pin").upsert({
    user_id: user.id,
    pin_hash: pinHash,
    last_unlock_at: new Date().toISOString(),
    failed_attempts: 0,
    user_timezone: timezone,
  });
  if (upsertError) {
    return NextResponse.json(
      { ok: false, error: "Erreur lors de l'enregistrement du PIN" },
      { status: 500 },
    );
  }

  // ── 4. app_metadata.has_pin = true (lu par le middleware, 0 DB query par nav) ─
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), has_pin: true },
  });

  // ── 5. Cookie HttpOnly signé ─────────────────────────────────────────────
  const cookieToken = await signPinUnlockCookie(user.id, 24);
  cookies().set({
    name: PIN_COOKIE_NAME,
    value: cookieToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  });

  // ── 6. Audit ─────────────────────────────────────────────────────────────
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
    eventType: AUDIT_EVENTS.PIN_SETUP,
    details: { timezone },
  });

  return NextResponse.json({ ok: true, redirectTo: nextParam });
}
