import { Shield, Server, FileLock, KeyRound, Download } from "lucide-react";

export default function MaiaSecurity() {
  return (
    <section id="securite" className="surface-2-bg py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="text-center max-w-[700px] mx-auto">
          <span className="eyebrow">Conformité &amp; sécurité</span>
          <h2 className="serif mt-6 text-3xl font-semibold ink sm:text-4xl">
            On gère des données de mineurs. On le prend au sérieux.
          </h2>
          <p className="mt-5 text-lg ink2">
            RGPD strict, hébergement européen, audit log immuable, contrat DPA fourni au
            déploiement.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-5">
            <Shield className="h-5 w-5 accent-text" />
            <h3 className="serif mt-3 text-base font-semibold ink">RGPD mineurs</h3>
            <p className="ink2 mt-2 text-sm leading-relaxed">
              Consentement parental géré par l&apos;école. Pas de profilage commercial.
              Droit à l&apos;oubli en 1 clic.
            </p>
          </div>
          <div className="card p-5">
            <Server className="h-5 w-5 accent-text" />
            <h3 className="serif mt-3 text-base font-semibold ink">Hébergement UE</h3>
            <p className="ink2 mt-2 text-sm leading-relaxed">
              Données stockées en Belgique et France (Supabase EU, Vercel Frankfurt). Pas
              de transfert hors UE sans DPA.
            </p>
          </div>
          <div className="card p-5">
            <FileLock className="h-5 w-5 accent-text" />
            <h3 className="serif mt-3 text-base font-semibold ink">Audit log immuable</h3>
            <p className="ink2 mt-2 text-sm leading-relaxed">
              Toute action sensible (note modifiée, accès admin) loggée en append-only.
              Opposable en cas de litige.
            </p>
          </div>
          <div className="card p-5">
            <KeyRound className="h-5 w-5 accent-text" />
            <h3 className="serif mt-3 text-base font-semibold ink">SSO entreprise</h3>
            <p className="ink2 mt-2 text-sm leading-relaxed">
              Pas de mot de passe stocké. Microsoft 365 + Google Workspace + SAML 2.0 sur
              demande.
            </p>
          </div>
        </div>

        <div className="mt-10 text-center">
          {/* Sprint 1.5 polish (a11y) : button (pas anchor) — pas de URL.
              TODO Sprint 1B+ : wire vrai download DPIA depuis docs/dpia-stub.md. */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-medium accent-text hover:underline"
          >
            Télécharger le DPIA + DPA complet
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
