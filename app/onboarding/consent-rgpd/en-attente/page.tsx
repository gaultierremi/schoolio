import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { Clock, Mail, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Page d'attente après demande de consent parent (Sprint 1B).
 *
 * - Si le student a déjà un consent signé valide → redirect /accueil
 * - Si fallback inline link disponible (passed via ?inlineLink=, ou si l'envoi
 *   email a foiré) → l'affiche pour que le student puisse l'envoyer manuellement
 *   à son parent par WhatsApp/SMS
 * - Sinon → message "demande envoyée, on attend la signature parent"
 *
 * Bouton "Renvoyer la demande" → re-POST /api/consent/request-parent
 * (idempotent : update même row si pas expirée).
 */
export default async function ConsentEnAttentePage({
  searchParams,
}: {
  searchParams: { inlineLink?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Si déjà signé, on redirige vers la suite
  const { data: signed } = await admin
    .from("consent_records")
    .select("id")
    .eq("student_user_id", user.id)
    .not("signed_at", "is", null)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (signed) {
    redirect("/onboarding/pin-setup");
  }

  // Fetch la dernière demande non-signée (pour afficher meta : expires_at)
  const { data: pending } = await admin
    .from("consent_records")
    .select("created_at, expires_at, parent_email_hash")
    .eq("student_user_id", user.id)
    .is("signed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inlineLink =
    typeof searchParams.inlineLink === "string" &&
    (searchParams.inlineLink.startsWith("http://") ||
      searchParams.inlineLink.startsWith("https://") ||
      searchParams.inlineLink.startsWith("/legal/consent/"))
      ? searchParams.inlineLink
      : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="w-full">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300">
            <Clock size={24} strokeWidth={1.75} />
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            En attente du parent
          </h1>
          <p className="text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            On a envoyé un lien de signature à ton parent. Dès qu&apos;il
            l&apos;aura signé, tu pourras continuer.
          </p>
        </div>

        {/* Fallback inline link — si l'envoi email a échoué */}
        {inlineLink && (
          <section className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
            <div className="flex items-start gap-3">
              <Share2
                size={18}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-300"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Envoie aussi ce lien à ton parent
                </p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  L&apos;envoi automatique par email a peut-être échoué.
                  Copie-colle ce lien dans un message WhatsApp ou SMS à
                  destination de ton parent.
                </p>
                <code
                  className="mt-2 block break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-200"
                >
                  {inlineLink}
                </code>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <div className="flex items-start gap-3">
            <Mail size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Que faire maintenant ?
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Préviens ton parent qu&apos;il a reçu un email de Maïa.</li>
                <li>Il clique le lien et signe le consentement.</li>
                <li>Tu reviens sur cette page et ton accès est débloqué automatiquement.</li>
              </ol>
              {pending && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                  Le lien expire le{" "}
                  {new Date(pending.expires_at).toLocaleString("fr-BE", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .
                </p>
              )}
            </div>
          </div>
        </section>

        <form
          action="/onboarding/consent-rgpd"
          method="get"
          className="mt-6"
        >
          <button
            type="submit"
            className="block w-full text-center text-xs text-slate-500 underline transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Renvoyer la demande avec un autre email
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-500">
          Problème ?{" "}
          <Link
            href="mailto:pilotes@maia.app"
            className="font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            pilotes@maia.app
          </Link>
        </p>
      </div>
    </main>
  );
}
