import { Atom, Grid3x3, Link2, Type, Equal, Calculator, Droplets, FlaskConical } from "lucide-react";

export default function MaiaProgramme() {
  return (
    <section id="programme" className="py-24">
      <div className="mx-auto max-w-[1200px] px-6 grid gap-12 lg:grid-cols-2 items-center">
        {/* Left — copy */}
        <div>
          <span className="eyebrow">Aligné programme officiel</span>
          <h2 className="serif mt-6 text-3xl font-semibold ink sm:text-4xl">
            Conçu pour le programme belge. Pas pour{" "}
            <em className="not-italic">tous les programmes</em>.
          </h2>
          <p className="mt-5 text-lg ink2 leading-relaxed">
            Notre IA est entraînée sur le programme officiel de la{" "}
            <strong className="ink">Fédération Wallonie-Bruxelles</strong>, secondaire
            général et qualifiant. Les concepts, les attendus, le vocabulaire — tout est
            calé sur ce que vos profs enseignent et ce que l&apos;élève voit à
            l&apos;examen.
          </p>
          <p className="mt-4 ink2">Couverture actuelle :</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="curr-tag">Chimie 3-6e</span>
            <span className="curr-tag">Physique 3-6e</span>
            <span className="curr-tag">Mathématiques 3-6e</span>
            <span className="curr-tag">Biologie 3-6e</span>
            <span className="curr-tag">Histoire 3-6e</span>
            <span className="curr-tag">Français · en bêta</span>
            <span
              className="curr-tag"
              style={{
                background: "rgb(var(--accent) / 0.08)",
                color: "rgb(var(--accent))",
              }}
            >
              Programme FR Éducation Nationale · 2027
            </span>
          </div>
          <p className="mt-6 text-sm ink3">
            Validation pédagogique par un panel de profs en exercice (Province de Liège,
            BW, Brabant Wallon).
          </p>
        </div>

        {/* Right — programme tree card */}
        <div className="card p-6">
          <p className="ink3 text-[10px] uppercase tracking-wide mb-2">
            Exemple : Chimie · 4ème secondaire
          </p>
          <p className="serif text-base font-semibold ink mb-4">
            8 thèmes officiels · 47 concepts atomiques
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 py-1.5 border-b border1">
              <Atom className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Atomes et structure atomique</span>
              <span className="ml-auto ink3 text-xs">6 concepts</span>
            </li>
            <li className="flex items-center gap-2 py-1.5 border-b border1">
              <Grid3x3 className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Tableau périodique</span>
              <span className="ml-auto ink3 text-xs">5 concepts</span>
            </li>
            <li className="flex items-center gap-2 py-1.5 border-b border1">
              <Link2 className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Liaisons chimiques</span>
              <span className="ml-auto ink3 text-xs">7 concepts</span>
            </li>
            <li className="flex items-center gap-2 py-1.5 border-b border1">
              <Type className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Nomenclature</span>
              <span className="ml-auto ink3 text-xs">5 concepts</span>
            </li>
            <li className="flex items-center gap-2 py-1.5 border-b border1">
              <Equal className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Équations chimiques</span>
              <span className="ml-auto ink3 text-xs">4 concepts</span>
            </li>
            <li className="flex items-center gap-2 py-1.5 border-b border1">
              <Calculator className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Stœchiométrie</span>
              <span className="ml-auto ink3 text-xs">8 concepts</span>
            </li>
            <li className="flex items-center gap-2 py-1.5 border-b border1">
              <Droplets className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Solutions et concentrations</span>
              <span className="ml-auto ink3 text-xs">6 concepts</span>
            </li>
            <li className="flex items-center gap-2 py-1.5">
              <FlaskConical className="h-3.5 w-3.5 accent-text" />
              <span className="ink">Acides et bases</span>
              <span className="ml-auto ink3 text-xs">6 concepts</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
