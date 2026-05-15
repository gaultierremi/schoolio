"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronRight, Sparkles, TrendingUp, BadgeCheck, Flame, Zap } from "lucide-react";
import type { HeatmapData, SubjectClass, ConceptBucket } from "@/lib/types/student-dashboard";
import ConceptHeatmapGrid from "./ConceptHeatmapGrid";
import SubjectClassPicker, { subjectColor } from "./SubjectClassPicker";
import WeeklyEffort from "./WeeklyEffort";

type Props = {
  displayName: string;
  initialData: HeatmapData | null;
};

function topPriorityConcept(cls: SubjectClass | null): ConceptBucket | null {
  if (!cls) return null;
  const withAttempts = cls.concepts.filter((c) => c.attempts > 0);
  if (withAttempts.length === 0) return null;
  // priority first, else lowest mastery
  const priority = withAttempts.find((c) => c.priority);
  if (priority) return priority;
  return withAttempts.slice().sort((a, b) => a.mastery - b.mastery)[0];
}

function bestGainConcept(classes: SubjectClass[]): ConceptBucket | null {
  // Heuristique simple : concept avec le plus grand nombre de correct
  // (proxy de "progrès" en attendant une vraie série temporelle).
  let best: ConceptBucket | null = null;
  for (const cls of classes) {
    for (const c of cls.concepts) {
      if (c.attempts < 3) continue;
      if (!best || c.correct > best.correct) best = c;
    }
  }
  return best;
}

export default function HeatmapDashboardClient({ displayName, initialData }: Props) {
  const [data] = useState<HeatmapData | null>(initialData);
  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialData?.subject_classes[0]?.class_id ?? "",
  );
  const router = useRouter();

  useEffect(() => {
    if (data && !selectedClassId && data.subject_classes[0]) {
      setSelectedClassId(data.subject_classes[0].class_id);
    }
  }, [data, selectedClassId]);

  const selected = useMemo(
    () => data?.subject_classes.find((c) => c.class_id === selectedClassId) ?? null,
    [data, selectedClassId],
  );

  const priorityConcept = topPriorityConcept(selected);
  const gainConcept = bestGainConcept(data?.subject_classes ?? []);

  if (!data || data.subject_classes.length === 0) {
    return (
      <div className="card mx-auto max-w-2xl p-10 text-center">
        <p className="serif text-2xl font-semibold text-[rgb(var(--ink))]">
          Bienvenue {displayName} !
        </p>
        <p className="mt-3 text-sm text-[rgb(var(--ink-2))]">
          Tu n&apos;es pas encore inscrit·e à une classe. Demande à ton prof son code d&apos;invitation pour rejoindre une matière.
        </p>
        <Link
          href="/join"
          className="btn-primary mt-6 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold"
        >
          Rejoindre une classe
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const color = selected ? subjectColor(selected.subject) : null;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 pb-12 sm:px-6">
      {/* ── GREETING + STREAK ─────────────────────────────────────────────── */}
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="serif text-3xl font-semibold text-[rgb(var(--ink))] sm:text-4xl">
            Salut {displayName}.
          </h1>
          <p className="mt-2 text-base text-[rgb(var(--ink-2))]">
            {priorityConcept ? (
              <>
                Cette semaine, on va bosser{" "}
                <span className="font-semibold text-[rgb(var(--accent))]">
                  {priorityConcept.label}
                </span>{" "}
                ensemble.
              </>
            ) : (
              "Choisis une matière pour voir ta progression."
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.streak_days > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5">
              <Flame className="h-4 w-4 text-[rgb(var(--warm))]" aria-hidden />
              <div>
                <p className="text-sm font-semibold leading-tight text-[rgb(var(--ink))]">
                  {data.streak_days} jour{data.streak_days > 1 ? "s" : ""}
                </p>
                <p className="text-[10px] leading-tight text-[rgb(var(--ink-3))]">série</p>
              </div>
            </div>
          )}
          {data.weekly_questions > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5">
              <Zap className="h-4 w-4 text-[rgb(250_204_21)]" aria-hidden />
              <div>
                <p className="text-sm font-semibold leading-tight text-[rgb(var(--ink))]">
                  {data.weekly_questions} questions
                </p>
                <p className="text-[10px] leading-tight text-[rgb(var(--ink-3))]">cette semaine</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── SUBJECT CLASS PICKER ──────────────────────────────────────────── */}
      <SubjectClassPicker
        classes={data.subject_classes}
        selectedClassId={selectedClassId}
        onSelect={setSelectedClassId}
      />

      {/* ── HEATMAP ───────────────────────────────────────────────────────── */}
      {selected && (
        <section className="card overflow-hidden">
          <div className="border-b border-[rgb(var(--border))] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selected.subject && color && (
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
                    {selected.subject.charAt(0).toUpperCase() + selected.subject.slice(1)}
                  </span>
                )}
                <span className="text-xs text-[rgb(var(--ink-3))]">
                  {selected.parent_class_name ?? selected.class_name}
                  {selected.parent_class_name && ` · ${selected.class_name}`}
                  {selected.concepts.length > 0 && ` · ${selected.concepts.length} thème${selected.concepts.length > 1 ? "s" : ""}`}
                </span>
              </div>
            </div>
            <h2 className="serif mt-2 text-xl font-semibold text-[rgb(var(--ink))]">
              Mes points à bosser
            </h2>
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
              Plus c&apos;est rouge, plus tu as besoin de pratique. Le vert, tu maîtrises.
            </p>
          </div>

          <div className="px-6 py-6">
            <ConceptHeatmapGrid concepts={selected.concepts} />
          </div>
        </section>
      )}

      {/* ── PLAN — bouton vers session ────────────────────────────────────── */}
      {priorityConcept && selected && (
        <section className="card overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
            <div className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[rgb(var(--accent))]" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--ink-3))]">
                  Plan Maïa · pour toi
                </span>
              </div>
              <h2 className="serif text-2xl font-semibold text-[rgb(var(--ink))]">
                Ta session du jour : <span className="text-[rgb(var(--accent))]">~16 minutes</span>
              </h2>
              <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
                Tu galères sur{" "}
                <strong className="text-[rgb(var(--ink))]">{priorityConcept.label}</strong>. On reprend les bases, puis on enchaîne avec des exercices guidés.
              </p>

              <div className="mt-5 space-y-3">
                <PlanStep n={1} title="Revoir : la théorie" subtitle="5 min · cours court avec exemples" />
                <PlanStep n={2} title="Exercices guidés" subtitle="8 min · 4 questions, Maïa t'aide si tu bloques" />
                <PlanStep n={3} title="Quiz éclair pour ancrer" subtitle="3 min · 5 questions rapides" />
              </div>

              <Link
                href="/accueil/devoirs"
                className="btn-primary mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold"
              >
                Aller à mes devoirs
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-2 text-center text-xs text-[rgb(var(--ink-3))]">
                Tu peux mettre en pause à tout moment.
              </p>
            </div>

            <div
              className="flex flex-col justify-center p-6 text-white md:p-8"
              style={{
                background: "linear-gradient(135deg, rgb(239 68 68) 0%, rgb(251 146 60) 100%)",
              }}
            >
              <p className="text-xs uppercase tracking-wider text-white/80">Concept prioritaire</p>
              <h3 className="serif mt-1 text-3xl font-semibold">{priorityConcept.label}</h3>
              <p className="mt-2 text-sm text-white/90">
                Tu as {priorityConcept.mastery}% de maîtrise sur ce thème.
                {priorityConcept.mastery < 50 ? " C'est par là qu'on commence." : ""}
              </p>

              <div className="mt-5 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                  {priorityConcept.correct}/{priorityConcept.attempts} questions correctes
                </div>
                {priorityConcept.last_seen && (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                    Vu pour la dernière fois {relativeDate(priorityConcept.last_seen)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── PROGRÈS CETTE SEMAINE ─────────────────────────────────────────── */}
      <section>
        <h2 className="serif mb-3 text-xl font-semibold text-[rgb(var(--ink))]">
          Tes progrès cette semaine
        </h2>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* Gain le plus important */}
          <div className="card p-5">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[rgb(34_197_94)]" aria-hidden />
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--ink-3))]">
                Plus gros gain
              </p>
            </div>
            {gainConcept ? (
              <>
                <p className="serif text-lg font-semibold text-[rgb(var(--ink))]">
                  {gainConcept.label}
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <p className="text-2xl font-semibold text-[rgb(34_197_94)]">
                    {gainConcept.mastery}%
                  </p>
                  <p className="text-xs text-[rgb(var(--ink-3))]">
                    {gainConcept.correct}/{gainConcept.attempts} correctes
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--surface-3))]">
                  <div
                    className="h-1.5 rounded-full bg-[rgb(132_204_22)]"
                    style={{ width: `${gainConcept.mastery}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-[rgb(var(--ink-2))]">
                Pas encore assez de questions pour calculer un gain.
              </p>
            )}
          </div>

          {/* Concepts maîtrisés */}
          <div className="card p-5">
            <div className="mb-2 flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-[rgb(var(--accent))]" aria-hidden />
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--ink-3))]">
                Concepts maîtrisés
              </p>
            </div>
            <MasteredSummary classes={data.subject_classes} />
          </div>

          {/* Effort hebdo */}
          <WeeklyEffort
            minutes={data.weekly_minutes}
            questions={data.weekly_questions}
            correctRate={data.weekly_correct_rate}
            daily={data.daily_effort}
          />
        </div>
      </section>

      {/* ── DEVOIRS — accès rapide ────────────────────────────────────────── */}
      <section className="pb-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="serif text-xl font-semibold text-[rgb(var(--ink))]">
            Tes devoirs en cours
          </h2>
          <Link
            href="/accueil/devoirs"
            className="text-xs text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]"
          >
            Tout voir <ChevronRight className="ml-0.5 inline h-3 w-3" aria-hidden />
          </Link>
        </div>

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 text-center text-sm text-[rgb(var(--ink-2))]">
          <Link
            href="/accueil/devoirs"
            className="inline-flex items-center gap-2 text-[rgb(var(--accent))] hover:underline"
          >
            Voir mes devoirs
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}

function PlanStep({ n, title, subtitle }: { n: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]">
        <span className="text-sm font-semibold">{n}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-[rgb(var(--ink))]">{title}</p>
        <p className="text-xs text-[rgb(var(--ink-3))]">{subtitle}</p>
      </div>
    </div>
  );
}

function MasteredSummary({ classes }: { classes: SubjectClass[] }) {
  let total = 0;
  let mastered = 0;
  const bars: number[] = [];
  for (const cls of classes) {
    for (const c of cls.concepts) {
      total += 1;
      bars.push(c.mastery);
      if (c.mastery >= 85) mastered += 1;
    }
  }
  if (total === 0) {
    return (
      <p className="text-sm text-[rgb(var(--ink-2))]">
        Pas encore de concepts trackés. Réponds à un devoir pour démarrer.
      </p>
    );
  }
  return (
    <>
      <p className="serif text-lg font-semibold text-[rgb(var(--ink))]">
        {mastered} sur {total}
      </p>
      <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
        {mastered === 0
          ? "Tu n'es pas encore au seuil de maîtrise (85%), mais tu approches."
          : `Continue comme ça !`}
      </p>
      <div className="mt-3 flex gap-1">
        {bars.slice(0, 8).map((v, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded ${
              v >= 85
                ? "bg-[rgb(34_197_94)]"
                : v >= 70
                ? "bg-[rgb(132_204_22)]"
                : v >= 55
                ? "bg-[rgb(250_204_21)]"
                : v >= 40
                ? "bg-[rgb(251_146_60)]"
                : "bg-[rgb(239_68_68)]"
            }`}
          />
        ))}
      </div>
    </>
  );
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "hier";
  return `il y a ${diffDays} j`;
}
