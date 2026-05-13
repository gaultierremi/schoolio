import { ShieldCheck, FileText } from "lucide-react";

export default function MaiaProcess() {
  return (
    <section id="comment" className="surface-2-bg py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="text-center max-w-[700px] mx-auto">
          <span className="eyebrow">En 4 étapes</span>
          <h2 className="serif mt-6 text-3xl font-semibold ink sm:text-4xl">
            Comment ça marche, concrètement.
          </h2>
          <p className="mt-5 text-lg ink2">
            Pas d&apos;IT, pas d&apos;app à installer. Vos profs sont opérationnels en 1
            heure.
          </p>
        </div>

        <div className="mt-14 space-y-12">

          {/* Step 1 */}
          <div className="grid gap-8 lg:grid-cols-[1fr_400px] items-center">
            <div>
              <div className="flex items-center gap-3">
                <span className="step-num">1</span>
                <span className="ink3 text-xs uppercase tracking-wide">
                  Onboarding école — 30 min
                </span>
              </div>
              <h3 className="serif mt-4 text-2xl font-semibold ink">
                Votre admin IT configure le SSO une fois
              </h3>
              <p className="mt-3 text-base ink2 leading-relaxed">
                Maïa s&apos;intègre à votre tenant Microsoft 365 ou Google Workspace. Vos
                profs et élèves se connectent avec leurs comptes habituels. Aucun mot de
                passe à gérer, aucune liste à uploader.
              </p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4" style={{ color: "rgb(var(--green))" }} />
                <span className="ink">SSO configuré</span>
              </div>
              <div className="divider my-3" />
              <div className="space-y-2 text-xs ink2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🟦</span>
                  <span>Microsoft Entra ID — connecté</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base">🟥</span>
                  <span>Google Workspace — disponible</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base">🔐</span>
                  <span>SAML 2.0 — sur demande</span>
                </div>
              </div>
              <div className="divider my-3" />
              <p className="ink3 text-[10px]">
                218 élèves, 14 profs auto-provisionnés depuis l&apos;annuaire
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="grid gap-8 lg:grid-cols-[400px_1fr] items-center">
            <div className="card p-5 order-2 lg:order-1">
              <p className="ink3 text-[10px] uppercase tracking-wide mb-3">PDF importé</p>
              <div className="rounded-lg border border1 p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 ink3" />
                  <p className="ink text-sm font-medium truncate">
                    chimie-4eme-stoechio.pdf
                  </p>
                </div>
                <p className="ink3 mt-1 text-[10px]">12 pages · analysé en 8 sec</p>
              </div>
              <div className="divider my-3" />
              <p className="ink3 text-[10px] uppercase tracking-wide mb-2">
                Questions générées
              </p>
              <p className="serif text-xl font-semibold ink">25 questions</p>
              <p className="ink3 text-xs mt-1">· 8 QCM · 4 V/F · 13 questions ouvertes</p>
              <button className="mt-3 w-full rounded-lg accent-bg px-3 py-2 text-xs font-semibold text-white">
                Valider et envoyer à la classe
              </button>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex items-center gap-3">
                <span className="step-num">2</span>
                <span className="ink3 text-xs uppercase tracking-wide">
                  Création contenu — 5 min par devoir
                </span>
              </div>
              <h3 className="serif mt-4 text-2xl font-semibold ink">
                Le prof upload son syllabus. L&apos;IA génère le quiz.
              </h3>
              <p className="mt-3 text-base ink2 leading-relaxed">
                Un PDF de cours, un thème — l&apos;IA génère 25 questions alignées sur le
                programme officiel. Le prof relit, ajuste si besoin, distribue à la
                classe. Pas besoin d&apos;être un expert en pédagogie numérique.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="grid gap-8 lg:grid-cols-[1fr_400px] items-center">
            <div>
              <div className="flex items-center gap-3">
                <span className="step-num">3</span>
                <span className="ink3 text-xs uppercase tracking-wide">
                  Pratique élève — 15 à 20 min
                </span>
              </div>
              <h3 className="serif mt-4 text-2xl font-semibold ink">
                L&apos;élève pratique. Le système apprend ses lacunes.
              </h3>
              <p className="mt-3 text-base ink2 leading-relaxed">
                Chaque réponse alimente le modèle de maîtrise par concept (algorithme
                SM-2 + tagging IA). L&apos;élève voit progresser sa carte des lacunes en
                temps réel. Quand il bute, le tuteur IA pose une question Socratique — il
                ne donne jamais la réponse.
              </p>
            </div>
            <div className="card p-5">
              <p className="ink3 text-[10px] uppercase tracking-wide">
                Ma maîtrise chimie
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <div className="pm-cell pm-2">55</div>
                <div className="pm-cell pm-3">68</div>
                <div className="pm-cell pm-1">42</div>
                <div className="pm-cell pm-1">38</div>
                <div className="pm-cell pm-1">32</div>
                <div className="pm-cell pm-1">18</div>
                <div className="pm-cell pm-1">22</div>
                <div className="pm-cell pm-1">35</div>
              </div>
              <div className="divider my-3" />
              <p className="ink3 text-[10px] uppercase tracking-wide">Plan IA suggéré</p>
              <p className="serif mt-1 text-base font-semibold ink">
                16 min sur la stœchio
              </p>
              <p className="ink3 text-xs mt-1">5 min théorie · 8 min exo · 3 min ancrage</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="grid gap-8 lg:grid-cols-[400px_1fr] items-center">
            <div className="card p-5 order-2 lg:order-1">
              <p className="ink3 text-[10px] uppercase tracking-wide">
                Lacunes collectives
              </p>
              <ul className="mt-3 space-y-2.5">
                <li>
                  <div className="flex items-center justify-between text-xs">
                    <span className="ink font-medium">Stœchiométrie</span>
                    <span className="font-semibold" style={{ color: "rgb(var(--red))" }}>
                      38%
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded-full"
                    style={{ background: "rgb(var(--border))" }}
                  >
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: "38%", background: "rgb(var(--red))" }}
                    />
                  </div>
                </li>
                <li>
                  <div className="flex items-center justify-between text-xs">
                    <span className="ink font-medium">Solutions</span>
                    <span className="font-semibold" style={{ color: "rgb(var(--warm))" }}>
                      47%
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded-full"
                    style={{ background: "rgb(var(--border))" }}
                  >
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: "47%", background: "rgb(var(--warm))" }}
                    />
                  </div>
                </li>
              </ul>
              <div className="divider my-3" />
              <p className="ink3 text-xs">
                17 élèves &lt; 50% sur stœchio. Reprise en cours collectif suggérée.
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex items-center gap-3">
                <span className="step-num">4</span>
                <span className="ink3 text-xs uppercase tracking-wide">
                  Boucle continue
                </span>
              </div>
              <h3 className="serif mt-4 text-2xl font-semibold ink">
                Le prof voit ce que la classe rate. Il ajuste son cours.
              </h3>
              <p className="mt-3 text-base ink2 leading-relaxed">
                Avant la prochaine séance, le prof voit sur quel concept toute la classe
                galère. Il reprend ce point en 10 min de cours collectif, puis Maïa teste
                à nouveau. Le cycle se poursuit jusqu&apos;à maîtrise.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
