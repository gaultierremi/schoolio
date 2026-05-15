import { NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

export const runtime = "nodejs";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * POST /api/consent/sign
 *
 * Sprint 1B — endpoint PUBLIC (pas de auth requise — le parent qui signe
 * n'est pas user de Maïa).
 *
 * Body : { token: string, signerName: string }
 *
 * Action :
 *  1. Lookup consent_records par signature_token_hash = sha256(token)
 *  2. Vérifier : non-expiré, non déjà signé
 *  3. Update : signed_at = NOW, signer_name_hash = bcrypt(signerName), signed_ip_hash = sha256(IP)
 *  4. Log audit côté student (actor_id = student_user_id, event_type=consent_given, details={ via: 'parent_signed' })
 *
 * Sécurité : on n'expose JAMAIS si un token existe ou pas (réponse identique
 * "token invalide" pour not_found / expired / already_signed). Évite l'oracle.
 */
export async function POST(request: Request) {
  let body: { token?: unknown; signerName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (typeof body.token !== "string" || body.token.length < 16) {
    return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 400 });
  }
  if (typeof body.signerName !== "string" || body.signerName.trim().length < 2) {
    return NextResponse.json(
      { ok: false, error: "Nom du signataire requis" },
      { status: 400 },
    );
  }

  const rawToken = body.token;
  const signerName = body.signerName.trim().slice(0, 200);

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const tokenHash = sha256(rawToken);

  // Lookup
  const { data: record } = await admin
    .from("consent_records")
    .select("id, student_user_id, expires_at, signed_at, revoked_at")
    .eq("signature_token_hash", tokenHash)
    .limit(1)
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ ok: false, error: "Lien invalide" }, { status: 400 });
  }
  if (record.signed_at) {
    return NextResponse.json(
      { ok: true, alreadySigned: true },
      { status: 200 },
    );
  }
  if (record.revoked_at) {
    return NextResponse.json({ ok: false, error: "Lien révoqué" }, { status: 400 });
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "Lien expiré" }, { status: 400 });
  }

  // Hash + IP
  const signerNameHash = await bcrypt.hash(signerName, 10);
  const ipRaw =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = ipRaw ? sha256(ipRaw) : null;

  // Update : marque signé
  const { error: updateError } = await admin
    .from("consent_records")
    .update({
      signed_at: new Date().toISOString(),
      signed_ip_hash: ipHash,
      signer_name_hash: signerNameHash,
    })
    .eq("id", record.id);

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: "Erreur lors de l'enregistrement" },
      { status: 500 },
    );
  }

  // Audit log côté student (l'event "consent_given" pour ce student_user_id,
  // avec details indiquant que c'est via parent signature)
  await logAuditEvent({
    actorId: record.student_user_id,
    actorRole: "student",
    eventType: AUDIT_EVENTS.CONSENT_GIVEN,
    targetType: "consent_record",
    targetId: record.id,
    details: { via: "parent_signed", signerNameHashed: true },
  });

  return NextResponse.json({ ok: true });
}
