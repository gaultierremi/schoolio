import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

export const runtime = "nodejs";

const MIN_ADULT_AGE = 16;

function computeAgeYears(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function getRole(appMeta: unknown): "student" | "teacher" | "system" {
  const role = (appMeta as Record<string, unknown>)?.role;
  if (role === "student" || role === "teacher") return role;
  return "system";
}

/**
 * POST /api/consent/give
 *
 * Sprint 1A : enregistre le consent adulte uniquement.
 * - Vérifie ≥ 16 ans (Art. 8 RGPD)
 * - Insert consent_records avec signed_at = NOW(), parent_email_hash = NULL
 * - Log audit CONSENT_GIVEN
 *
 * Mineurs (Sprint 1B) : rejet 400 + invitation à contacter pilotes@maia.app.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  let body: { birthdate?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (typeof body.birthdate !== "string" || body.birthdate.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Date de naissance requise" },
      { status: 400 },
    );
  }
  const age = computeAgeYears(body.birthdate);
  if (age === null || age < 0 || age > 120) {
    return NextResponse.json(
      { ok: false, error: "Date de naissance invalide" },
      { status: 400 },
    );
  }
  if (age < MIN_ADULT_AGE) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sprint 1A scope adulte uniquement. Le workflow de consentement parental arrive en Sprint 1B. Contacte pilotes@maia.app pour t'inscrire en attendant.",
      },
      { status: 400 },
    );
  }

  const nextParam =
    typeof body.next === "string" && body.next.startsWith("/")
      ? body.next
      : "/onboarding/pin-setup";

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Double-check : si déjà consenti, no-op + return ok
  const { data: existing } = await admin
    .from("consent_records")
    .select("id")
    .eq("student_user_id", user.id)
    .not("signed_at", "is", null)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, redirectTo: nextParam });
  }

  // Insert nouveau consent adulte auto-signé
  const { data: inserted, error: insertError } = await admin
    .from("consent_records")
    .insert({
      student_user_id: user.id,
      parent_email_hash: null,
      signed_at: new Date().toISOString(),
      // signer_name_hash : non-collecté pour l'adulte auto-signé (Sprint 1A simplifié)
      expires_at: new Date(Date.now() + 99 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: "Erreur lors de l'enregistrement du consentement" },
      { status: 500 },
    );
  }

  await logAuditEvent({
    actorId: user.id,
    actorEmail: user.email ?? null,
    actorRole: getRole(user.app_metadata),
    eventType: AUDIT_EVENTS.CONSENT_GIVEN,
    targetType: "consent_record",
    targetId: inserted.id,
    details: { ageGroup: "adult", ageYears: age },
  });

  return NextResponse.json({ ok: true, redirectTo: nextParam });
}
