import { UserRound, Presentation, Building2, Check } from "lucide-react";

export default function MaiaPromises() {
  return (
    <section id="produit" className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="text-center max-w-[700px] mx-auto">
          <span className="eyebrow">Notre approche</span>
          <h2 className="serif mt-6 text-3xl font-semibold ink sm:text-4xl">
            Une plateforme. Trois personnes qui y gagnent.
          </h2>
          <p className="mt-5 text-lg ink2">
            Maïa n&apos;est pas un outil de plus pour le prof. C&apos;est un système qui
            voit l&apos;élève, montre au prof, et fait le travail répétitif.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {/* L'élève */}
          <article className="card-feature p-7">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                background: "rgb(var(--accent) / 0.10)",
                color: "rgb(var(--accent))",
              }}
            >
              <UserRound className="h-5 w-5" />
            </div>
            <h3 className="serif mt-5 text-xl font-semibold ink">Pour l&apos;élève</h3>
            <p className="serif mt-1 text-lg ink2 italic">
              &quot;Je vois mes lacunes et je sais quoi faire.&quot;
            </p>
            <ul className="mt-5 space-y-3 text-sm ink2">
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Carte personnelle de maîtrise par concept
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Sessions ciblées de 15-20 min, pas 2h de blabla
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Tuteur IA qui guide sans donner la réponse
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Gamification dosée (streak, progrès — pas Candy Crush)
              </li>
            </ul>
          </article>

          {/* Le prof */}
          <article
            className="card-feature p-7"
            style={{ borderColor: "rgb(var(--accent) / 0.4)" }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl accent-bg text-white">
              <Presentation className="h-5 w-5" />
            </div>
            <h3 className="serif mt-5 text-xl font-semibold ink">Pour le prof</h3>
            <p className="serif mt-1 text-lg ink2 italic">
              &quot;Je vois ma classe et je gagne 4h par semaine.&quot;
            </p>
            <ul className="mt-5 space-y-3 text-sm ink2">
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Carte des lacunes par devoir et par élève
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Génération de quiz à partir de votre syllabus PDF
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Plan de remédiation IA suggéré pour chaque élève
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Mode contrôle/examen verrouillé pour évaluations
              </li>
            </ul>
          </article>

          {/* L'école */}
          <article className="card-feature p-7">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                background: "rgb(var(--accent) / 0.10)",
                color: "rgb(var(--accent))",
              }}
            >
              <Building2 className="h-5 w-5" />
            </div>
            <h3 className="serif mt-5 text-xl font-semibold ink">Pour l&apos;école</h3>
            <p className="serif mt-1 text-lg ink2 italic">
              &quot;Conforme, intégré, sans IT.&quot;
            </p>
            <ul className="mt-5 space-y-3 text-sm ink2">
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Déploiement SSO en 30 minutes (M365, Google)
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Aligné programme FW-B officiel (FR à venir)
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                RGPD mineurs · audit log immuable · DPA fourni
              </li>
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "rgb(var(--green))" }}
                />
                Dashboard direction : progression par classe / matière
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
