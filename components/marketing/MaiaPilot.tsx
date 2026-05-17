import { ArrowRight } from "lucide-react";

export default function MaiaPilot() {
  return (
    <section id="pilote" className="py-24">
      <div className="mx-auto max-w-[900px] px-6">
        <div
          className="card overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgb(var(--accent-soft)) 0%, rgb(var(--surface)) 100%)",
            borderColor: "rgb(var(--accent) / 0.3)",
          }}
        >
          <div className="p-10 lg:p-14">
            <span className="eyebrow">Programme pilote · rentrée 2026</span>
            <h2 className="serif mt-6 text-3xl font-semibold ink sm:text-4xl">
              Nous cherchons{" "}
              <em className="not-italic accent-text">3 écoles pilotes</em>.
            </h2>
            <p className="mt-5 text-lg ink2 leading-relaxed">
              Accompagnement personnalisé par notre équipe, gratuit pendant 6 mois. On
              vous aide à intégrer Maïa dans 1 à 3 classes, on co-construit avec vos
              profs, on mesure les résultats ensemble.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              <div>
                <p className="serif text-3xl font-semibold accent-text">6 mois</p>
                <p className="ink2 mt-1 text-sm">Gratuit · pas d&apos;engagement</p>
              </div>
              <div>
                <p className="serif text-3xl font-semibold accent-text">1-3 classes</p>
                <p className="ink2 mt-1 text-sm">Démarrage progressif</p>
              </div>
              <div>
                <p className="serif text-3xl font-semibold accent-text">2h/sem</p>
                <p className="ink2 mt-1 text-sm">Support direct par les fondateurs</p>
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href="mailto:hello@schoolio.app"
                className="btn-primary rounded-xl px-6 py-3.5 text-base font-semibold inline-flex items-center gap-2"
              >
                Postuler comme école pilote
                <ArrowRight className="h-4 w-4" />
              </a>
              {/* Sprint 1.5 polish (a11y) : button (pas anchor) — pas de URL,
                  c'est une action (subscribe newsletter). TODO Sprint 2C+ :
                  wire vraie action newsletter. */}
              <button
                type="button"
                className="btn-secondary rounded-xl px-6 py-3.5 text-base font-medium inline-flex items-center gap-2"
              >
                Plus tard, juste me tenir au courant
              </button>
            </div>

            <p className="mt-6 text-xs ink3">
              Ou écrivez-nous directement :{" "}
              <a href="mailto:hello@schoolio.app" className="accent-text underline">
                hello@schoolio.app
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
