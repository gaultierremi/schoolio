import programme from "@/data/programmes/mock-programme.json";
import type { ReactNode } from "react";

type ProgrammeUnit = {
  id: string;
  titre: string;
  competences: string[];
  savoirs: string[];
};

type ProgrammeData = {
  unites: ProgrammeUnit[];
};

const programmeData = programme as ProgrammeData;

function SectionCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[420px] flex-col rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl shadow-black/20">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-400">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function ComparateurPage() {
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-purple-400">
              Comparateur
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Cours vs programme officiel
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-gray-400">
            Coquille de lecture seule pour préparer l'analyse comparative.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr_1fr]">
          <SectionCard eyebrow="Zone gauche" title="Mon cours">
            <label className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-700 bg-gray-950/60 px-6 py-10 text-center transition hover:border-purple-500/60 hover:bg-purple-500/5">
              <input
                type="file"
                accept=".pdf,.docx,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown"
                className="sr-only"
              />
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10 text-2xl">
                ↑
              </span>
              <span className="mt-5 text-lg font-black text-white">
                Dépose ton cours ici
              </span>
              <span className="mt-2 text-sm text-gray-400">
                PDF, DOCX ou Markdown
              </span>
              <span className="mt-6 rounded-2xl bg-purple-500 px-5 py-3 text-sm font-black text-gray-950 transition hover:bg-purple-400">
                Choisir un fichier
              </span>
            </label>
          </SectionCard>

          <SectionCard eyebrow="Zone centre" title="Programme officiel">
            <div className="space-y-3">
              {programmeData.unites.map((unit) => (
                <article
                  key={unit.id}
                  className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 transition hover:border-purple-500/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs text-gray-500">{unit.id}</p>
                      <h3 className="mt-1 text-base font-black text-white">
                        {unit.titre}
                      </h3>
                    </div>
                    <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300">
                      unité
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
                      <p className="text-2xl font-black text-white">
                        {unit.competences.length}
                      </p>
                      <p className="text-xs font-medium text-gray-400">
                        compétences
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
                      <p className="text-2xl font-black text-white">
                        {unit.savoirs.length}
                      </p>
                      <p className="text-xs font-medium text-gray-400">savoirs</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Zone droite" title="Analyse">
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-gray-950/60 p-6 text-center">
              <p className="max-w-sm text-sm leading-6 text-gray-400">
                L'analyse comparative apparaîtra ici une fois ton cours déposé
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
