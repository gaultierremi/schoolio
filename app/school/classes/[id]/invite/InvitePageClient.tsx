"use client";

import { useState } from "react";

type Props = {
  classId: string;
  className: string;
  invitationCode: string;
  invitationEnabled: boolean;
  invitationExpiresAt: string | null;
  memberCount: number;
  joinUrl: string;
};

export default function InvitePageClient({
  classId,
  className,
  invitationCode: initialCode,
  invitationEnabled: initialEnabled,
  invitationExpiresAt: initialExpires,
  memberCount,
  joinUrl: initialJoinUrl,
}: Props) {
  const [code, setCode] = useState(initialCode);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [expiresAt, setExpiresAt] = useState(initialExpires ?? "");
  const [copied, setCopied] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const baseUrl = initialJoinUrl.replace(/\/join.*/, "");
  const joinUrl = `${baseUrl}/join?code=${code}`;
  // QR generated server-side via our own API (rule 15: no third-party image services)
  const qrUrl = `/api/classes/${classId}/invite-qr`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  }

  async function handleToggleEnabled() {
    const newVal = !enabled;
    setSaving(true);
    const res = await fetch(`/api/classes/${classId}/invitation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_enabled: newVal }),
    });
    if (res.ok) setEnabled(newVal);
    setSaving(false);
  }

  async function handleSaveExpiry() {
    setSaving(true);
    await fetch(`/api/classes/${classId}/invitation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_expires_at: expiresAt || null }),
    });
    setSaving(false);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    const res = await fetch(`/api/classes/${classId}/invitation/regenerate`, {
      method: "POST",
    });
    if (res.ok) {
      const data = (await res.json()) as { invitation_code: string };
      setCode(data.invitation_code);
    }
    setRegenerating(false);
    setShowRegenConfirm(false);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <a
          href={`/school/classes/${classId}`}
          className="text-xs text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]"
        >
          ← {className}
        </a>
        <h1 className="serif mt-3 text-2xl font-black text-[rgb(var(--ink))]">🔗 Inviter des élèves</h1>
        <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
          Partage ce code ou ce QR avec tes élèves pour qu&apos;ils rejoignent la classe automatiquement.
        </p>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggleEnabled}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            enabled ? "bg-[rgb(var(--accent))]" : "bg-[rgb(var(--surface-3))] ring-1 ring-[rgb(var(--border))]"
          } disabled:opacity-60`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm font-semibold text-[rgb(var(--ink))]">
          {enabled ? "Inscriptions activées" : "Inscriptions désactivées"}
        </span>
        <span className="ml-auto text-xs text-[rgb(var(--ink-3))]">
          {memberCount} élève{memberCount !== 1 ? "s" : ""} dans la classe
        </span>
      </div>

      {/* Code + QR */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">

          {/* QR Code */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div className="rounded-xl border border-[rgb(var(--border))] bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt={`QR Code pour rejoindre ${className}`}
                width={180}
                height={180}
                className="block"
              />
            </div>
            <a
              href={qrUrl}
              download={`qr-${code}.png`}
              className="text-xs text-[rgb(var(--ink-3))] underline underline-offset-2 hover:text-[rgb(var(--ink-2))]"
            >
              Telecharger le QR
            </a>
          </div>

          {/* Code + actions */}
          <div className="flex-1 space-y-4 text-center sm:text-left">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--ink-3))]">
                Code d&apos;invitation
              </p>
              <p className="mt-2 font-mono text-4xl font-black tracking-[0.2em] text-[rgb(var(--accent))]">
                {code}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--ink-3))]">
                Lien direct
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-[rgb(var(--surface-3))] px-3 py-2 text-xs text-[rgb(var(--ink-2))]">
                  {joinUrl}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                >
                  {copied ? "✓ Copié" : "Copier"}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowRegenConfirm(true)}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--red))]/40 hover:text-[rgb(var(--red))]"
            >
              🔄 Régénérer le code
            </button>
          </div>
        </div>
      </div>

      {/* Expiry */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="mb-3 text-sm font-bold text-[rgb(var(--ink))]">Date d&apos;expiration</h2>
        <div className="flex items-center gap-3">
          <input
            type="datetime-local"
            value={expiresAt ? expiresAt.slice(0, 16) : ""}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="flex-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--ink))] focus:border-[rgb(var(--accent))] focus:outline-none"
          />
          <button
            onClick={handleSaveExpiry}
            disabled={saving}
            className="shrink-0 rounded-xl bg-[rgb(var(--accent))] px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Enregistrer
          </button>
          {expiresAt && (
            <button
              onClick={() => { setExpiresAt(""); handleSaveExpiry(); }}
              className="shrink-0 text-xs text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]"
            >
              Effacer
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-[rgb(var(--ink-3))]">
          Laisse vide pour ne pas mettre de date limite.
        </p>
      </div>

      {/* Regen confirm modal */}
      {showRegenConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-xl">
            <h3 className="font-bold text-[rgb(var(--ink))]">Régénérer le code ?</h3>
            <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
              Le code actuel <span className="font-mono font-bold text-[rgb(var(--accent))]">{code}</span> ne fonctionnera plus. Les élèves qui ne l&apos;ont pas encore utilisé devront utiliser le nouveau code.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowRegenConfirm(false)}
                className="flex-1 rounded-xl border border-[rgb(var(--border))] py-2.5 text-sm font-bold text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              >
                Annuler
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex-1 rounded-xl bg-[rgb(var(--red))] py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {regenerating ? "…" : "Régénérer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
