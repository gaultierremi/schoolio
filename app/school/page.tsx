"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { motion, useReducedMotion } from "framer-motion";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

// ── Types ─────────────────────────────────────────────────────────────────────

type SchoolStats = {
  totalQuestions: number;
  questionsBySubject: { subject_enum: SubjectId; label: string; emoji: string; count: number }[];
  questionsByLevel: { level: number | null; count: number }[];
  publicQuestions: number;
  lastQuestionCreatedAt: string | null;
  sessionsCreated: number;
  aiGeneratedShare: number;
};

// ── Static maps ───────────────────────────────────────────────────────────────

const SUBJECT_BAR_COLOR: Record<string, string> = {
  amber:  "bg-amber-500",
  blue:   "bg-blue-500",
  cyan:   "bg-cyan-500",
  green:  "bg-green-500",
  teal:   "bg-teal-500",
  purple: "bg-purple-500",
  red:    "bg-red-500",
  orange: "bg-orange-500",
  pink:   "bg-pink-500",
  indigo: "bg-indigo-500",
  gray:   "bg-gray-500",
};

const LEVEL_SHORT: Record<number, string> = {
  1: "1ère", 2: "2ème", 3: "3ème", 4: "4ème", 5: "5ème", 6: "6ème",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffH  = Math.floor(diffMs / (1000 * 60 * 60));
  const diffD  = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffH  <  1) return "à l'instant";
  if (diffH  < 24) return `il y a ${diffH} heure${diffH > 1 ? "s" : ""}`;
  if (diffD === 1) return "hier";
  if (diffD  <  7) return `il y a ${diffD} jours`;
  const w = Math.floor(diffD / 7);
  return `il y a ${w} semaine${w > 1 ? "s" : ""}`;
}

// Zone D — count-up animation for KPI stats
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (reduced || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, reduced]);

  return value;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-800 ${className ?? ""}`} />;
}

function StatCard({
  emoji,
  label,
  displayValue,
  isEmpty,
  subtext,
}: {
  emoji: string;
  label: string;
  displayValue: string | number;
  isEmpty: boolean;
  subtext?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
        {emoji}&nbsp;{label}
      </p>
      {isEmpty ? (
        <p className="mt-3 text-sm italic text-gray-600">Aucune pour l'instant</p>
      ) : (
        <>
          <p className="mt-2 text-3xl font-black text-white">{displayValue}</p>
          {subtext && (
            <p className="mt-1 text-xs text-gray-500">{subtext}</p>
          )}
        </>
      )}
    </div>
  );
}

function BarRow({
  label,
  count,
  total,
  colorClass,
  index = 0,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
  index?: number;
}) {
  const reduced = useReducedMotion();
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="font-bold tabular-nums text-white">{count}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-800">
        <motion.div
          className={`h-1.5 rounded-full ${colorClass}`}
          initial={reduced ? undefined : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduced ? undefined : { duration: 0.8, ease: "easeOut" as const, delay: index * 0.1 }}
        />
      </div>
    </div>
  );
}

function ActionCard({
  emoji,
  title,
  description,
  href,
}: {
  emoji: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-5 transition hover:border-purple-500/50 hover:bg-gray-800/60"
    >
      <span className="shrink-0 text-3xl">{emoji}</span>
      <div className="min-w-0">
        <p className="font-black text-white">{title}</p>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
    </a>
  );
}

function VisionCard({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="relative rounded-2xl border-2 border-dashed border-gray-700 bg-gray-900/50 p-5">
      <motion.span
        className="absolute right-4 top-4 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300"
        animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
        transition={reduced ? undefined : { repeat: Infinity, duration: 2, ease: "easeInOut" }}
      >
        Bientôt
      </motion.span>
      <span className="text-3xl">{emoji}</span>
      <p className="mt-3 font-bold text-white">{title}</p>
      <p className="mt-1 text-sm text-gray-400">{description}</p>
      <button
        disabled
        className="mt-4 cursor-not-allowed rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-600 opacity-50"
      >
        Notifie-moi quand c'est prêt
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchoolDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const router   = useRouter();

  const [user,         setUser]         = useState<User | null>(null);
  const [isTeacher,    setIsTeacher]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [stats,        setStats]        = useState<SchoolStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const [{ data: userData }, { data: rpcData, error: rpcError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("is_current_user_school_teacher"),
      ]);

      const teacher = rpcData === true && !rpcError;
      setUser(userData.user);
      setIsTeacher(teacher);
      setLoading(false);

      if (!teacher) return;

      setStatsLoading(true);
      const res = await fetch("/api/school/stats");
      if (res.status === 403) {
        router.replace("/");
        return;
      }
      setStats((await res.json()) as SchoolStats);
      setStatsLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zone D — count-up hooks (must be before any early return)
  const countTotalQ   = useCountUp(stats?.totalQuestions   ?? 0);
  const countSessions = useCountUp(stats?.sessionsCreated  ?? 0);
  const countPublic   = useCountUp(stats?.publicQuestions  ?? 0);
  const countAI       = useCountUp(stats?.aiGeneratedShare ?? 0);

  // ── Loading (phase 1 : RPC + auth) ────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-10 w-64" />
          <SkeletonBlock className="h-4 w-48" />
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-28" />)}
          </div>
        </div>
      </main>
    );
  }

  // ── Accès refusé ──────────────────────────────────────────────────────────

  if (!isTeacher) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-black text-red-300">Accès refusé</h1>
          <p className="mt-2 text-gray-300">
            Cet espace est réservé aux professeurs autorisés.
          </p>
        </div>
      </main>
    );
  }

  // ── Données ───────────────────────────────────────────────────────────────

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name  as string | undefined) ??
    user?.email ??
    "Enseignant";

  const totalQ = stats?.totalQuestions ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-5xl">

        {/* ── BANDEAU BASELINE ── */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-300">
            ✨ Schoolio — La plateforme qui révèle ton potentiel
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            Plateforme en construction active · beta enseignant
          </p>
        </div>

        {/* ── HEADER ── */}
        <header>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎓</span>
            <h1 className="text-3xl font-black text-white">Espace enseignant</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {displayName}
            <span className="mx-2 text-gray-700">·</span>
            <span className="italic text-gray-600">École en mode beta</span>
          </p>
        </header>

        {/* ── SECTION 1 — KPI ── */}
        <section className="mt-10">
          {statsLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-28" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                emoji="📚"
                label="Mes questions"
                displayValue={countTotalQ}
                isEmpty={totalQ === 0}
              />
              <StatCard
                emoji="🎯"
                label="Sessions créées"
                displayValue={countSessions}
                isEmpty={(stats?.sessionsCreated ?? 0) === 0}
              />
              <StatCard
                emoji="🌍"
                label="Questions publiques"
                displayValue={countPublic}
                isEmpty={(stats?.publicQuestions ?? 0) === 0}
                subtext="partagées avec la communauté"
              />
              <StatCard
                emoji="🤖"
                label="% IA dans la base"
                displayValue={
                  (stats?.aiGeneratedShare ?? 0) === 0 ? "—" : `${countAI}%`
                }
                isEmpty={false}
              />
            </div>
          )}
        </section>

        {/* ── SECTION 2 — VUE D'ENSEMBLE ── */}
        <section className="mt-8">
          <h2 className="text-lg font-black text-white">Vue d'ensemble</h2>
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">

            {/* Colonne A — Par matière */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Répartition par matière
              </h3>
              {statsLoading ? (
                <div className="mt-4 space-y-3">
                  {[...Array(5)].map((_, i) => <SkeletonBlock key={i} className="h-8" />)}
                </div>
              ) : !stats || stats.questionsBySubject.length === 0 ? (
                <div className="mt-6 text-center">
                  <p className="text-sm italic text-gray-600">
                    Crée ta première question pour voir la répartition
                  </p>
                  <a
                    href="/school/questions"
                    className="mt-3 inline-block text-sm font-bold text-purple-400 underline underline-offset-2 hover:text-purple-300"
                  >
                    Créer une question →
                  </a>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {stats.questionsBySubject.slice(0, 5).map((s, i) => {
                    const meta       = SUBJECTS_BY_ID[s.subject_enum];
                    const colorClass = SUBJECT_BAR_COLOR[meta?.color ?? ""] ?? "bg-purple-500";
                    return (
                      <BarRow
                        key={s.subject_enum}
                        label={`${s.emoji} ${s.label}`}
                        count={s.count}
                        total={totalQ}
                        colorClass={colorClass}
                        index={i}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Colonne B — Par niveau */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Répartition par niveau
              </h3>
              {statsLoading ? (
                <div className="mt-4 space-y-3">
                  {[...Array(6)].map((_, i) => <SkeletonBlock key={i} className="h-8" />)}
                </div>
              ) : !stats || stats.questionsByLevel.length === 0 ? (
                <p className="mt-6 text-center text-sm italic text-gray-600">
                  Aucun niveau renseigné pour l'instant
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {stats.questionsByLevel.map((l, i) => (
                    <BarRow
                      key={l.level ?? "null"}
                      label={
                        l.level !== null
                          ? (LEVEL_SHORT[l.level] ?? `${l.level}ème`)
                          : "Tous niveaux"
                      }
                      count={l.count}
                      total={totalQ}
                      colorClass="bg-purple-500"
                      index={i}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── SECTION 3 — ACTIONS RAPIDES ── */}
        <section className="mt-8">
          <h2 className="text-lg font-black text-white">Actions rapides</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <ActionCard
              emoji="✏️"
              title="Créer une question"
              description="QCM ou Vrai/Faux, manuel ou IA"
              href="/school/questions"
            />
            <ActionCard
              emoji="📚"
              title="Mes cours"
              description="Consulte et gère tes documents uploadés"
              href="/school/courses"
            />
            <ActionCard
              emoji="📄"
              title="Importer en masse"
              description="Glisse-dépose tes PDF de cours, l'IA détecte matière et niveau"
              href="/school/import"
            />
            <ActionCard
              emoji="🗂️"
              title="Mon organisation"
              description="Crée des tags pour organiser tes cours comme tu le veux"
              href="/school/organization"
            />
            <ActionCard
              emoji="🏫"
              title="Mes classes"
              description="Crée tes classes et invite tes élèves avec un code"
              href="/school/classes"
            />
            <ActionCard
              emoji="🎮"
              title="Lancer une session"
              description="Quiz live avec ta classe"
              href="/school/session/new"
            />
            <ActionCard
              emoji="📊"
              title="Voir ma bibliothèque"
              description="Toutes mes questions organisées"
              href="/school/questions"
            />
          </div>
        </section>

        {/* ── SECTION VISION ── */}
        <section className="mt-10">
          <h2 className="text-lg font-black text-white">🚀 Bientôt sur Schoolio</h2>
          <p className="mt-1 text-sm text-gray-500">Ce qui arrive dans les prochaines semaines</p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <VisionCard
              emoji="📖"
              title="Bibliothèque de cours"
              description="Uploade tes PDF de cours par chapitre. Schoolio les organise et les rend exploitables pour générer des questions adaptées."
            />
            <VisionCard
              emoji="🎯"
              title="Devoirs adaptatifs"
              description="Un clic sur 'Devoir' à la fin d'un chapitre. Tes élèves reçoivent un set de questions personnalisé selon leurs lacunes. Ils font dans le bus, tu vois les résultats le matin."
            />
            <VisionCard
              emoji="📊"
              title="Suivi élèves intelligent"
              description="Visualise qui galère sur quoi, qui décroche, qui maîtrise. Reçois des alertes ciblées pour intervenir au bon moment."
            />
          </div>
        </section>

        {/* ── SECTION ROADMAP ── */}
        <section className="mt-8">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
              🛤️ Feuille de route
            </h3>
            <ul className="mt-4 space-y-2">
              {[
                "✅ Adaptatif IA multi-matières",
                "✅ Génération de questions depuis PDF",
                "✅ Espace enseignant",
                "🔄 Classes et élèves (en développement)",
                "📋 Devoirs asynchrones (à venir)",
                "📋 Suivi élèves temps réel (à venir)",
                "💭 Repérage bienveillant des profils d'apprentissage atypiques (TDAH, dys, HPI) — orientation, jamais diagnostic",
                "💭 Intégration Pronote / Smartschool (idée)",
                "💭 App mobile native (idée)",
              ].map((item) => (
                <li key={item} className="text-sm text-gray-400">{item}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── SECTION 4 — DERNIÈRE ACTIVITÉ ── */}
        {stats?.lastQuestionCreatedAt && (
          <p className="mt-8 border-t border-gray-800 pt-6 text-sm text-gray-500">
            Dernière question créée&nbsp;:{" "}
            <span className="text-gray-400">
              {formatRelativeTime(stats.lastQuestionCreatedAt)}
            </span>
          </p>
        )}

      </div>
    </main>
  );
}
