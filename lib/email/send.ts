/**
 * Abstraction email transactionnel (Sprint 1A).
 *
 * Architecture (cf. plan Sprint 1A critique #6) :
 * - Provider swappable via env var. Sprint 1A : Resend si `RESEND_API_KEY` set,
 *   sinon stub `console.log` qui no-op mais retourne ok:true.
 * - Le call-site (e.g. workflow consent parent Sprint 1B) ne dépend jamais
 *   directement de Resend / Postmark — il appelle juste `sendEmail()`.
 * - Future-proof : ajouter Postmark / AWS SES = ajouter une branche ici, pas
 *   toucher les call-sites.
 *
 * Fallback robustness : si le provider échoue, le caller peut afficher le
 * lien de signature inline au lieu de bloquer le user (mémoire fallback
 * inline link pour workflow consent parent mineur Sprint 1B).
 */

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional override of the from address. Defaults to `MAIL_FROM` env or noreply@maia.app. */
  from?: string;
};

export type SendEmailResult = {
  ok: boolean;
  provider: "resend" | "stub";
  error?: string;
  /** Provider message id if available (for traceability). */
  messageId?: string;
};

const DEFAULT_FROM = process.env.MAIL_FROM ?? "noreply@maia.app";

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  // ── Stub fallback ───────────────────────────────────────────────────────
  if (!apiKey || apiKey.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[email stub] would send:", {
      to: params.to,
      subject: params.subject,
      preview: params.text.slice(0, 120),
    });
    return { ok: true, provider: "stub" };
  }

  // ── Resend provider ─────────────────────────────────────────────────────
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from ?? DEFAULT_FROM,
        to: params.to,
        subject: params.subject,
        text: params.text,
        ...(params.html ? { html: params.html } : {}),
      }),
    });
    if (!res.ok) {
      let errMessage = `Resend HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) errMessage = body.message;
      } catch {
        // ignore JSON parse errors
      }
      return { ok: false, provider: "resend", error: errMessage };
    }
    const body = (await res.json()) as { id?: string };
    return { ok: true, provider: "resend", messageId: body.id };
  } catch (err) {
    return {
      ok: false,
      provider: "resend",
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}
