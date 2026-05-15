"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Users, School, PencilLine, CheckCircle2, type LucideIcon } from "lucide-react";

type Stats = {
  total_courses: number;
  active_students: number;
  active_classes: number;
  total_assignments: number;
  validated_questions: number;
};

function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return;
    }
    const duration = 900;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active]);

  return value;
}

type KpiDef = {
  key: keyof Stats;
  label: string;
  Icon: LucideIcon;
  href: string;
};

const KPI_DEFS: KpiDef[] = [
  { key: "total_courses",       label: "Cours importés",    Icon: BookOpen,       href: "/accueil/cours"   },
  { key: "active_students",     label: "Élèves actifs",      Icon: Users,          href: "/accueil/classes"   },
  { key: "active_classes",      label: "Classes actives",    Icon: School,         href: "/accueil/classes"   },
  { key: "total_assignments",   label: "Devoirs créés",       Icon: PencilLine,     href: "/accueil/classes"   },
  { key: "validated_questions", label: "Questions validées",  Icon: CheckCircle2,   href: "/accueil/curation" },
];

function KpiCard({
  def,
  value,
  active,
}: {
  def: KpiDef;
  value: number;
  active: boolean;
}) {
  const displayed = useCountUp(value, active);
  return (
    <Link
      href={def.href}
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all hover:border-[rgb(var(--accent))]/50 hover:bg-[rgb(var(--surface-3))]"
    >
      <def.Icon className="mb-2 h-5 w-5 text-[rgb(var(--accent))]" aria-hidden />
      <div className="serif tabular-nums text-3xl font-black text-[rgb(var(--ink))]">{displayed}</div>
      <div className="mt-1 text-xs text-[rgb(var(--ink-3))]">{def.label}</div>
    </Link>
  );
}

export default function KpiGrid({
  stats,
  loading,
}: {
  stats?: Stats;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-[rgb(var(--surface-3))]" />
        ))}
      </div>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
        Vue d&apos;ensemble
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KPI_DEFS.map((def) => (
          <KpiCard
            key={def.key}
            def={def}
            value={stats?.[def.key] ?? 0}
            active={!loading}
          />
        ))}
      </div>
    </section>
  );
}
