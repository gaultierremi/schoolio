import { ArrowRight, PlayCircle, CheckCircle2 } from "lucide-react";

export default function MaiaHero() {
  return (
    <section className="hero-bg">
      <div className="mx-auto max-w-[1200px] grid gap-12 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
        {/* Left — copy */}
        <div>
          <span className="eyebrow">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "rgb(var(--green))" }}
            />
            Plateforme d&apos;apprentissage augmentée · Belgique FW-B
          </span>

          <h1 className="serif mt-6 text-5xl font-semibold leading-[1.05] tracking-tight ink sm:text-6xl">
            Apprendre{" "}
            <em className="not-italic accent-text">ce qu&apos;on ne sait pas</em> encore.
          </h1>

          <p className="mt-6 text-xl leading-relaxed ink2">
            Maïa pose à chaque élève{" "}
            <em className="not-italic ink">les bonnes questions</em> pour révéler ses
            lacunes — puis les combler. Le prof voit sa classe d&apos;un coup d&apos;œil.
            L&apos;élève sait quoi faire en 16 minutes.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#pilote"
              className="btn-primary rounded-xl px-5 py-3 text-base font-semibold inline-flex items-center gap-2"
            >
              Demander une démo
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#produit"
              className="btn-secondary rounded-xl px-5 py-3 text-base font-medium inline-flex items-center gap-2"
            >
              Voir le produit en 2 min
              <PlayCircle className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-5 text-sm ink3">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" style={{ color: "rgb(var(--green))" }} />
              SSO Microsoft 365 + Google Workspace
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" style={{ color: "rgb(var(--green))" }} />
              Données hébergées en UE
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" style={{ color: "rgb(var(--green))" }} />
              RGPD mineurs
            </span>
          </div>
        </div>

        {/* Right — heatmap preview card */}
        <div className="relative">
          <div
            className="card overflow-hidden p-5 shadow-xl"
            style={{ boxShadow: "0 24px 60px rgb(11 18 32 / 0.10)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="ink3 text-[10px] uppercase tracking-wide">
                  Vue prof — 4ème B chimie
                </p>
                <p className="serif text-base font-semibold ink mt-0.5">
                  Devoir #3 — Stœchiométrie
                </p>
              </div>
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: "rgb(37 99 235 / 0.10)",
                  color: "rgb(37 99 235)",
                }}
              >
                Chimie
              </span>
            </div>

            <div className="space-y-1.5">
              {/* Row: Moyenne */}
              <div className="grid grid-cols-[80px_repeat(8,1fr)] gap-1.5 text-[10px] items-center">
                <span className="ink3 truncate">Moyenne</span>
                <div className="pm-cell pm-4">78</div>
                <div className="pm-cell pm-5">81</div>
                <div className="pm-cell pm-4">72</div>
                <div className="pm-cell pm-3">64</div>
                <div className="pm-cell pm-3">58</div>
                <div className="pm-cell pm-1">38</div>
                <div className="pm-cell pm-2">47</div>
                <div className="pm-cell pm-3">60</div>
              </div>
              {/* Row: Mathéo V. */}
              <div className="grid grid-cols-[80px_repeat(8,1fr)] gap-1.5 text-[10px] items-center">
                <span className="ink truncate font-medium">Mathéo V.</span>
                <div className="pm-cell pm-2">55</div>
                <div className="pm-cell pm-3">68</div>
                <div className="pm-cell pm-1">42</div>
                <div className="pm-cell pm-1">38</div>
                <div className="pm-cell pm-1">32</div>
                <div className="pm-cell pm-1">18</div>
                <div className="pm-cell pm-1">22</div>
                <div className="pm-cell pm-1">35</div>
              </div>
              {/* Row: Kylian D. */}
              <div className="grid grid-cols-[80px_repeat(8,1fr)] gap-1.5 text-[10px] items-center">
                <span className="ink truncate font-medium">Kylian D.</span>
                <div className="pm-cell pm-3">60</div>
                <div className="pm-cell pm-3">72</div>
                <div className="pm-cell pm-2">55</div>
                <div className="pm-cell pm-2">48</div>
                <div className="pm-cell pm-1">38</div>
                <div className="pm-cell pm-1">22</div>
                <div className="pm-cell pm-1">28</div>
                <div className="pm-cell pm-2">42</div>
              </div>
              {/* Row: Adèle L. */}
              <div className="grid grid-cols-[80px_repeat(8,1fr)] gap-1.5 text-[10px] items-center">
                <span className="ink truncate font-medium">Adèle L.</span>
                <div className="pm-cell pm-5">88</div>
                <div className="pm-cell pm-5">92</div>
                <div className="pm-cell pm-4">84</div>
                <div className="pm-cell pm-4">78</div>
                <div className="pm-cell pm-4">82</div>
                <div className="pm-cell pm-4">72</div>
                <div className="pm-cell pm-3">68</div>
                <div className="pm-cell pm-4">75</div>
              </div>
              {/* Row: Zoé D. */}
              <div className="grid grid-cols-[80px_repeat(8,1fr)] gap-1.5 text-[10px] items-center">
                <span className="ink truncate font-medium">Zoé D.</span>
                <div className="pm-cell pm-5">92</div>
                <div className="pm-cell pm-5">95</div>
                <div className="pm-cell pm-5">88</div>
                <div className="pm-cell pm-5">85</div>
                <div className="pm-cell pm-4">82</div>
                <div className="pm-cell pm-4">72</div>
                <div className="pm-cell pm-4">78</div>
                <div className="pm-cell pm-4">82</div>
              </div>
              {/* Row: Lou B. */}
              <div className="grid grid-cols-[80px_repeat(8,1fr)] gap-1.5 text-[10px] items-center">
                <span className="ink3 truncate">Lou B.</span>
                <div className="pm-cell pm-0">—</div>
                <div className="pm-cell pm-0">—</div>
                <div className="pm-cell pm-0">—</div>
                <div className="pm-cell pm-0">—</div>
                <div className="pm-cell pm-0">—</div>
                <div className="pm-cell pm-0">—</div>
                <div className="pm-cell pm-0">—</div>
                <div className="pm-cell pm-0">—</div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-[10px] ink3">
              <span>8 concepts · 25 élèves · programme FW-B</span>
              <span className="accent-text font-medium">+ voir tous les élèves →</span>
            </div>
          </div>

          {/* Floating tag */}
          <div
            className="absolute -right-2 -top-2 card p-2.5 text-xs"
            style={{ boxShadow: "0 8px 24px rgb(11 18 32 / 0.08)" }}
          >
            <p className="ink3 text-[10px] uppercase tracking-wide">Lacune classe</p>
            <p className="serif font-semibold ink">Stœchiométrie</p>
            <p className="text-[10px]" style={{ color: "rgb(var(--red))" }}>
              38% maîtrise
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
