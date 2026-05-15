import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, History, ShieldCheck, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ConsentRow = {
  id: string;
  signed_at: string | null;
  revoked_at: string | null;
  parent_email_hash: string | null;
  created_at: string;
};

type AuditRow = {
  id: number;
  occurred_at: string;
  event_type: string;
  details: Record<string, unknown> | null;
};

const RELEVANT_AUDIT_EVENTS = [
  "sso_login",
  "pin_setup",
  "pin_success",
  "pin_failure",
  "pin_lockout",
  "pin_reset",
  "consent_given",
  "consent_revoked",
  "data_export_requested",
  "account_deletion_requested",
];

const EVENT_LABELS: Record<string, string> = {
  sso_login: "Connexion via SSO",
  pin_setup: "Configuration du PIN",
  pin_success: "Déverrouillage PIN",
  pin_failure: "Tentative PIN incorrecte",
  pin_lockout: "Verrouillage après échecs PIN",
  pin_reset: "Réinitialisation PIN",
  consent_given: "Consentement donné",
  consent_revoked: "Consentement révoqué",
  data_export_requested: "Demande d'export",
  account_deletion_requested: "Demande de suppression",
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-BE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Page Confidentialité (Sprint 1A — RGPD Art. 15 droit d'accès).
 *
 * Affiche :
 * - Tes consentements (signés, révoqués)
 * - Les 20 derniers événements d'audit pertinents (SSO, PIN, consent)
 *
 * La révocation et la suppression effective arrivent en Sprint 1B (cf. plan).
 */
export default async function ConfidentialitePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: consents } = await admin
    .from("consent_records")
    .select("id, signed_at, revoked_at, parent_email_hash, created_at")
    .eq("student_user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: events } = await admin
    .from("audit_log")
    .select("id, occurred_at, event_type, details")
    .eq("actor_id", user.id)
    .in("event_type", RELEVANT_AUDIT_EVENTS)
    .order("occurred_at", { ascending: false })
    .limit(20);

  const consentRows = (consents ?? []) as ConsentRow[];
  const eventRows = (events ?? []) as AuditRow[];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:py-12">
      <Link
        href="/accueil/parametres"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Paramètres
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Confidentialité
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Tes consentements et ton journal d&apos;activité (RGPD Art. 15 droit
        d&apos;accès).
      </p>

      {/* Consents section */}
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <ShieldCheck size={16} strokeWidth={1.75} />
          Consentements
        </div>

        {consentRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Aucun consentement enregistré.
          </p>
        ) : (
          <ul className="space-y-2">
            {consentRows.map((c) => {
              const isMinor = !!c.parent_email_hash;
              const isSigned = !!c.signed_at;
              const isRevoked = !!c.revoked_at;
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span
                    className={
                      "mt-0.5 " +
                      (isRevoked
                        ? "text-amber-500"
                        : isSigned
                          ? "text-emerald-500"
                          : "text-slate-400")
                    }
                  >
                    {isRevoked ? (
                      <XCircle size={18} strokeWidth={1.75} />
                    ) : isSigned ? (
                      <CheckCircle2 size={18} strokeWidth={1.75} />
                    ) : (
                      <ShieldCheck size={18} strokeWidth={1.75} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {isMinor ? "Consentement parental" : "Consentement adulte"}
                      {isRevoked && " (révoqué)"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {isSigned
                        ? `Signé le ${formatDate(c.signed_at!)}`
                        : `Créé le ${formatDate(c.created_at)} — en attente`}
                    </p>
                    {isRevoked && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Révoqué le {formatDate(c.revoked_at!)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
          La révocation effective (Art. 7(3)) et la suppression du compte
          (Art. 17) arrivent en Sprint 1B. En attendant, contacte{" "}
          <a
            href="mailto:dpo@maia.app"
            className="font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            dpo@maia.app
          </a>{" "}
          pour toute demande RGPD urgente.
        </p>
      </section>

      {/* Audit log section */}
      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <History size={16} strokeWidth={1.75} />
          Journal d&apos;activité
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {eventRows.length} récents
          </span>
        </div>

        {eventRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Aucun événement enregistré pour l&apos;instant.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {eventRows.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(ev.occurred_at)}
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
          Conservation 5 ans par défaut (purge automatique post-MVP). Détail
          dans la{" "}
          <Link
            href="/legal/confidentialite"
            className="font-medium text-indigo-600 underline dark:text-indigo-400"
          >
            politique de confidentialité
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
