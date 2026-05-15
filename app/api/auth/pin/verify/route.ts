import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { verifyPin, isValidPinFormat, shouldFallbackSSO } from "@/lib/auth/pin";
import { signPinUnlockCookie, PIN_COOKIE_NAME } from "@/lib/auth/pin-cookie";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import { createHash } from "crypto";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 3;

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

function getRole(appMeta: unknown): "student" | "teacher" | "system" {
  const role = (appMeta as Record<string, unknown>)?.role;
  if (role === "student" || role === "teacher") return role;
  return "system";
}

/**
 * POST /api/auth/pin/verify
 *
 * Body : { pin: string (4 chiffres), next?: string }
 *
 * Action :
 *  - Fetch user_pin row du user
 *  - verifyPin(pin, hash)
 *  - Success : reset failed_attempts = 0, last_unlock_at = NOW(), set cookie, log PIN_SUCCESS
 *  - Failure < 3 : increment failed_attempts, log PIN_FAILURE, return attemptsLeft
 *  - Failure >= 3 : log PIN_LOCKOUT, return { lockedOut: true } — le client signOut
 */
export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  // ── Body validation ──────────────────────────────────────────────────────
  let body: { pin?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 });
  }
  if (typeof body.pin !== "string" || !isValidPinFormat(body.pin)) {
    return NextResponse.json({ ok: false, error: "Format PIN invalide" }, { status: 400 });
  }
  const pin = body.pin;
  const nextParam =
    typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/accueil";

  // ── Fetch user_pin row ────────────────────────────────────────────────────
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: pinRow } = await admin
    .from("user_pin")
    .select("pin_hash, failed_attempts")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pinRow) {
    return NextResponse.json(
      { ok: false, error: "Aucun PIN configuré. Configure-le d'abord." },
      { status: 400 },
    );
  }

  // ── Audit context ─────────────────────────────────────────────────────────
  const role = getRole(user.app_metadata);
  const ipHash = hashIp(
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  );
  const userAgent = request.headers.get("user-agent") ?? null;

  // ── Verify ───────────────────────────────────────────────────────────────
  const valid = await verifyPin(pin, pinRow.pin_hash);

  // Log la tentative dans pin_attempts (audit append-only)
  await admin.from("pin_attempts").insert({
    user_id: user.id,
    success: valid,
    ip_hash: ipHash,
    user_agent: userAgent,
  });

  if (valid) {
    // Success : reset compteur + set cookie + audit
    await admin
      .from("user_pin")
      .update({
        failed_attempts: 0,
        last_unlock_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const cookieToken = await signPinUnlockCookie(user.id, 24);
    cookies().set({
      name: PIN_COOKIE_NAME,
      value: cookieToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: role,
      eventType: AUDIT_EVENTS.PIN_SUCCESS,
      ipAddress: null,
      userAgent,
    });

    return NextResponse.json({ ok: true, redirectTo: nextParam });
  }

  // Failure : increment failed_attempts
  const newFailedCount = (pinRow.failed_attempts ?? 0) + 1;
  await admin
    .from("user_pin")
    .update({ failed_attempts: newFailedCount })
    .eq("user_id", user.id);

  const lockedOut = shouldFallbackSSO(newFailedCount);

  await logAuditEvent({
    actorId: user.id,
    actorEmail: user.email ?? null,
    actorRole: role,
    eventType: lockedOut ? AUDIT_EVENTS.PIN_LOCKOUT : AUDIT_EVENTS.PIN_FAILURE,
    details: { failedAttempts: newFailedCount },
    userAgent,
  });

  if (lockedOut) {
    // Reset le compteur pour ne pas bloquer après re-login. La row reste
    // (le user pourra re-essayer après SSO+reset).
    return NextResponse.json({
      ok: false,
      lockedOut: true,
      error: "Trop d'échecs. Tu vas être déconnecté.",
    });
  }

  return NextResponse.json({
    ok: false,
    error: "PIN incorrect.",
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - newFailedCount),
  });
}
