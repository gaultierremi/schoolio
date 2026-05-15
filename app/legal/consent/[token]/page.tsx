import { createHash } from "crypto";
import Link from "next/link";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { AlertCircle, ShieldCheck } from "lucide-react";
import SignClient from "./SignClient";

export const dynamic = "force-dynamic";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Page signature parent (Sprint 1B — workflow consent mineur).
 *
 * Accessible PUBLIQUEMENT (pas de check auth — le parent n'est pas
 * forcément user de Maïa). Token UUIDv4 brut dans l'URL, hashé SHA-256
 * pour le lookup en DB.
 *
 * Cas gérés :
 * - Token introuvable → message "lien invalide ou expiré"
 * - Token trouvé mais expiré → message "expiré, contacte l'enfant"
 * - Token trouvé déjà signé → "consentement déjà donné"
 * - Token trouvé valide → affiche le résumé + form signature
 */
export default async function ConsentSignaturePage({
  params,
}: {
  params: { token: string };
}) {
  const rawToken = params.token;
  if (typeof rawToken !== "string" || rawToken.length < 16) {
    return <InvalidTokenScreen reason="malformed" />;
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const tokenHash = sha256(rawToken);
  const { data: record } = await admin
    .from("consent_records")
    .select(
      "id, student_user_id, expires_at, signed_at, revoked_at, created_at",
    )
    .eq("signature_token_hash", tokenHash)
    .limit(1)
    .maybeSingle();

  if (!record) {
    return <InvalidTokenScreen reason="not_found" />;
  }

  if (record.signed_at) {
    return <AlreadySignedScreen signedAt={record.signed_at} />;
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return <InvalidTokenScreen reason="expired" />;
  }

  // Fetch student firstName for personalization (read-only join)
  const { data: profile } = await admin
    .from("user_profiles")
    .select("first_name")
    .eq("id", record.student_user_id)
    .maybeSingle();
  const studentName =
    (profile as { first_name?: string | null } | null)?.first_name ?? "votre enfant";

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
          <ShieldCheck size={20} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Consentement parental
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pour autoriser <strong>{studentName}</strong> à utiliser Maïa.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Ce que Maïa collecte sur votre enfant
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <li>Son email scolaire (via SSO Google / Microsoft / SmartSchool)</li>
          <li>Son prénom et pseudo</li>
          <li>Les classes qu&apos;il/elle rejoint</li>
          <li>Ses réponses aux quiz et devoirs (pour adapter les exercices)</li>
          <li>Sa progression par concept (mastery)</li>
          <li>Un journal de connexions (sécurité)</li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Aucune donnée sensible (santé, religion, opinions politiques). Aucune
          publicité, aucune revente à des tiers. Les enseignants voient les
          réponses pour adapter le cours. Vous pouvez à tout moment demander
          la suppression du compte via{" "}
          <a
            href="mailto:dpo@maia.app"
            className="font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            dpo@maia.app
          </a>
          .
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Plus de détails sur la{" "}
          <Link
            href="/legal/confidentialite"
            target="_blank"
            rel="noopener"
            className="font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            politique de confidentialité
          </Link>
          .
        </p>
      </section>

      <SignClient
        rawToken={rawToken}
        studentName={studentName}
        expiresAt={record.expires_at}
      />
    </main>
  );
}

function InvalidTokenScreen({
  reason,
}: {
  reason: "malformed" | "not_found" | "expired";
}) {
  const messages: Record<typeof reason, string> = {
    malformed: "Le lien semble incorrect. Vérifiez l'URL.",
    not_found:
      "Ce lien n'est pas reconnu. Il a peut-être déjà été utilisé ou l'enfant a fait une nouvelle demande.",
    expired:
      "Ce lien a expiré (validité 72 heures). Demandez à votre enfant de relancer une nouvelle demande.",
  };
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertCircle size={24} strokeWidth={1.75} />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Lien invalide
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {messages[reason]}
      </p>
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">
        Question ?{" "}
        <a
          href="mailto:pilotes@maia.app"
          className="font-medium text-indigo-600 underline dark:text-indigo-400"
        >
          pilotes@maia.app
        </a>
      </p>
    </main>
  );
}

function AlreadySignedScreen({ signedAt }: { signedAt: string }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
        <ShieldCheck size={24} strokeWidth={1.75} />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Consentement déjà donné
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        Vous avez signé ce consentement le{" "}
        {new Date(signedAt).toLocaleString("fr-BE", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        . Votre enfant peut maintenant utiliser Maïa.
      </p>
    </main>
  );
}
