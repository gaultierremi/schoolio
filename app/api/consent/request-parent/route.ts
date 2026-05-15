import { NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email/send";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

export const runtime = "nodejs";

const MIN_ADULT_AGE = 16;
const TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h

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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function getBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * POST /api/consent/request-parent
 *
 * Sprint 1B — workflow consent parental mineur <16 ans (mémoire
 * project_consent_parental_minor).
 *
 * Body : { parentEmail: string, birthdate: string, next?: string }
 *
 * Action :
 *  1. Vérifier que le user est bien <16 (sinon redirect vers consent adulte)
 *  2. Hash parent email (bcrypt cost 10) — JAMAIS l'email en clair en DB
 *  3. Génère token UUIDv4 + hash SHA-256 (déterministe pour lookup)
 *  4. INSERT consent_records (parent_email_hash + signature_token_hash + expires_at)
 *  5. Envoie email parent via sendEmail (Resend si configuré, sinon stub)
 *  6. Log audit CONSENT_GIVEN (avec context "parent_requested")
 *  7. Return ok + inlineFallbackUrl si l'envoi mail a échoué
 *
 * Sécurité critique : la variable `parentEmail` n'est utilisée que pour
 * sendEmail() à l'étape 5 puis sort de la closure. Jamais persistée en clair.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  let body: { parentEmail?: unknown; birthdate?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (typeof body.parentEmail !== "string" || body.parentEmail.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Email parent requis" },
      { status: 400 },
    );
  }
  const parentEmail = body.parentEmail.trim();
  // Quick sanity check (pas une regex de paranoïa)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail) || parentEmail.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Format email parent invalide" },
      { status: 400 },
    );
  }

  if (typeof body.birthdate !== "string") {
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
  if (age >= MIN_ADULT_AGE) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tu as 16 ans ou plus — utilise le flux adulte (auto-signature).",
      },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── Hash parent email + génère token ────────────────────────────────────
  const parentEmailHash = await bcrypt.hash(parentEmail, 10);
  const rawToken = randomUUID();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Idempotence : si une demande non-signée non-expirée existe, on l'invalide
  // et on en crée une nouvelle (pour permettre de changer l'email parent
  // si le student fait une faute de frappe).
  await admin
    .from("consent_records")
    .delete()
    .eq("student_user_id", user.id)
    .is("signed_at", null);

  const { error: insertError } = await admin.from("consent_records").insert({
    student_user_id: user.id,
    parent_email_hash: parentEmailHash,
    signature_token_hash: tokenHash,
    expires_at: expiresAt,
    signed_at: null,
  });

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: "Erreur lors de la création de la demande" },
      { status: 500 },
    );
  }

  // ── Envoi email parent ──────────────────────────────────────────────────
  const baseUrl = getBaseUrl();
  const signLink = `${baseUrl}/legal/consent/${rawToken}`;

  const studentName =
    (user.user_metadata?.firstName as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "votre enfant";

  const emailResult = await sendEmail({
    to: parentEmail,
    subject: `Maïa — demande de consentement pour ${studentName}`,
    text:
      `Bonjour,\n\n` +
      `${studentName} souhaite utiliser Maïa, plateforme d'apprentissage pour le secondaire (programme officiel FW-B).\n\n` +
      `Étant donné qu'il/elle a moins de 16 ans, la loi (RGPD Art. 8) requiert votre consentement parental.\n\n` +
      `Cliquez sur ce lien pour lire ce qui est collecté et signer (ou refuser) :\n\n` +
      `${signLink}\n\n` +
      `Ce lien expire dans 72 heures.\n\n` +
      `Détails de la politique de confidentialité : ${baseUrl}/legal/confidentialite\n\n` +
      `— L'équipe Maïa\n` +
      `pilotes@maia.app · dpo@maia.app`,
    html:
      `<p>Bonjour,</p>` +
      `<p><strong>${studentName}</strong> souhaite utiliser <a href="${baseUrl}">Maïa</a>, plateforme d'apprentissage pour le secondaire (programme officiel FW-B).</p>` +
      `<p>Étant donné qu'il/elle a moins de 16 ans, la loi (RGPD Art. 8) requiert <strong>votre consentement parental</strong>.</p>` +
      `<p><a href="${signLink}" style="display:inline-block;padding:12px 20px;background:#4F46E5;color:white;border-radius:8px;text-decoration:none;font-weight:600;">Lire et signer</a></p>` +
      `<p style="color:#64748b;font-size:13px;">Ce lien expire dans 72 heures.</p>` +
      `<p style="color:#64748b;font-size:13px;">Politique de confidentialité : <a href="${baseUrl}/legal/confidentialite">${baseUrl}/legal/confidentialite</a></p>` +
      `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">` +
      `<p style="color:#64748b;font-size:12px;">L'équipe Maïa — <a href="mailto:pilotes@maia.app">pilotes@maia.app</a> · <a href="mailto:dpo@maia.app">dpo@maia.app</a></p>`,
  });

  // Log audit. On ne met JAMAIS parentEmail dans details.
  const role = getRole(user.app_metadata);
  await logAuditEvent({
    actorId: user.id,
    actorEmail: user.email ?? null,
    actorRole: role,
    eventType: AUDIT_EVENTS.CONSENT_GIVEN,
    details: {
      via: "parent_requested",
      ageYears: age,
      emailProvider: emailResult.provider,
      emailOk: emailResult.ok,
    },
  });

  // Si email failed → on renvoie le lien direct au student (fallback inline)
  if (!emailResult.ok) {
    return NextResponse.json({
      ok: true,
      inlineFallbackUrl: signLink,
      warning:
        "L'envoi automatique a échoué — partage ce lien à ton parent manuellement.",
    });
  }

  return NextResponse.json({ ok: true });
}
