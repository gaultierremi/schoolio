"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageRangeGenerator } from "./_components/PageRangeGenerator";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExerciseStatus = "pending" | "validated" | "rejected" | "archived";

type Exercise = {
  id: string;
  course_id: string;
  title: string;
  statement: string;
  exercise_type: string | null;
  difficulty: number | null;
  status: ExerciseStatus;
  generated_by_model: string | null;
  created_at: string;
  exercise_steps: { id: string }[];
  page_range_start: number | null;
  page_range_end: number | null;
};

type CourseInfo = {
  id: string;
  title: string | null;
  subject_enum: string | null;
  pages_count: number | null;
};

type ValTab = "pending" | "validated" | "rejected" | "archived";

// ── Helpers ───────────────────────────────────────────────────────────────────

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  calcul:        "Calcul",
  demonstration: "Démonstration",
  analyse:       "Analyse",
  redaction:     "Rédaction",
  application:   "Application",
  autre:         "Autre",
};

const TYPE_BADGE_STYLE: Record<string, string> = {
  calcul:        "bg-blue-100 text-blue-700",
  demonstration: "bg-purple-100 text-purple-700",
  analyse:       "bg-cyan-100 text-cyan-700",
  redaction:     "bg-amber-100 text-amber-800",
  application:   "bg-green-100 text-green-700",
  autre:         "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-2))]",
};


function Stars({ count }: { count: number | null }) {
  if (!count) return null;
  return (
    <span className="text-sm text-yellow-500">
      {"★".repeat(count)}{"☆".repeat(3 - count)}
    </span>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const style = TYPE_BADGE_STYLE[type] ?? TYPE_BADGE_STYLE.autre;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-black uppercase ${style}`}>
      {EXERCISE_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ── Generate modal ────────────────────────────────────────────────────────────

function GenerateModal({
  courseId,
  onClose,
  onSuccess,
}: {
  courseId: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const [count, setCount] = useState(5);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const countId = useId();

  async function launch() {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/courses/${courseId}/generate-exercises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const json = await res.json() as { generated?: number; error?: string };
      if (!res.ok) {
        setErrorMsg(json.error ?? "Erreur serveur");
        setState("error");
        return;
      }
      onSuccess(json.generated ?? count);
    } catch {
      setErrorMsg("Erreur réseau, réessaie.");
      setState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={state === "idle" ? onClose : undefined} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-2xl">
        {state === "loading" ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
            <p className="font-black text-[rgb(var(--ink))]">Génération en cours via Maïa…</p>
            <p className="text-center text-sm text-[rgb(var(--ink-2))]">
              Patience, ~60s en moyenne. Maïa analyse le PDF et génère {count} exercices avec résolutions détaillées.
            </p>
          </div>
        ) : (
          <>
            <h2 className="serif text-lg font-black text-[rgb(var(--ink))]">Générer des exercices</h2>
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
              Maïa va créer des exercices avec résolutions étape par étape depuis le PDF du cours.
            </p>

            <div className="mt-5">
              <label htmlFor={countId} className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                Nombre d&apos;exercices
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id={countId}
                  type="range"
                  min={3}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="flex-1 accent-[rgb(var(--accent))]"
                />
                <span className="w-8 text-center text-lg font-black text-[rgb(var(--ink))]">{count}</span>
              </div>
              <p className="mt-1 text-xs text-[rgb(var(--ink-3))]">entre 3 et 10 exercices</p>
            </div>

            {state === "error" && (
              <div className="mt-4 rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-3 text-sm font-bold text-[rgb(var(--red))]">
                {errorMsg}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-bold text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              >
                Annuler
              </button>
              <button
                onClick={launch}
                className="rounded-xl bg-[rgb(var(--accent))] px-5 py-2 text-sm font-black text-white hover:opacity-90"
              >
                Lancer la génération
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Exercise card ─────────────────────────────────────────────────────────────

function PageRangeBadge({ start, end }: { start: number; end: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">
      📄 p.{start}–{end}
    </span>
  );
}

function ExerciseCard({
  exercise,
  courseId,
  onChanged,
}: {
  exercise: Exercise;
  courseId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const canArchive = exercise.status === "validated";
  const canRestore = exercise.status === "archived" || exercise.status === "rejected";

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/courses/${courseId}/exercises/${exercise.id}/archive`, { method: "POST" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/courses/${courseId}/exercises/${exercise.id}/restore`, { method: "POST" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-all hover:border-[rgb(var(--accent))]/40 hover:bg-[rgb(var(--surface-3))]">
      <Link
        href={`/accueil/cours/${courseId}/exercices/${exercise.id}`}
        className="block"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {exercise.exercise_type && <TypeBadge type={exercise.exercise_type} />}
          {exercise.status === "validated" && <Stars count={exercise.difficulty} />}
          {exercise.page_range_start !== null && exercise.page_range_end !== null && (
            <PageRangeBadge start={exercise.page_range_start} end={exercise.page_range_end} />
          )}
          <span className="ml-auto text-xs text-[rgb(var(--ink-3))]">
            {exercise.exercise_steps.length} étape{exercise.exercise_steps.length > 1 ? "s" : ""}
          </span>
        </div>
        <p className="font-bold leading-snug text-[rgb(var(--ink))]">{exercise.title}</p>
        {exercise.generated_by_model && (
          <p className="mt-2 text-xs text-[rgb(var(--ink-3))]">Généré par Maïa</p>
        )}
      </Link>
      {(canArchive || canRestore) && (
        <div className="mt-3 flex justify-end gap-2 border-t border-[rgb(var(--border))] pt-3">
          {canArchive && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={busy}
              className="rounded-full border border-[rgb(var(--border))] px-3 py-1 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--warm))]/60 hover:text-[rgb(var(--warm))] disabled:opacity-50"
            >
              {busy ? "…" : "Désactiver"}
            </button>
          )}
          {canRestore && (
            <button
              type="button"
              onClick={handleRestore}
              disabled={busy}
              className="rounded-full border border-[rgb(var(--border))] px-3 py-1 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--green))]/60 hover:text-[rgb(var(--green))] disabled:opacity-50"
            >
              {busy ? "…" : "Réactiver"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExercisesListPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ValTab>("pending");
  const [filterStars, setFilterStars] = useState<0 | 1 | 2 | 3>(0);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showRangeGenerator, setShowRangeGenerator] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [startingLive, setStartingLive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleStartLive() {
    setStartingLive(true);
    router.push(`/accueil/cours/${courseId}/live`);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleExtractQuestions() {
    setExtracting(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/extract-questions`, { method: "POST" });
      const json = await res.json() as { extracted?: number; message?: string; error?: string };
      if (!res.ok) {
        showToast(json.error ?? "Erreur lors de l'extraction");
      } else if ((json.extracted ?? 0) === 0) {
        showToast(json.message ?? "Aucune question trouvée dans le PDF");
      } else {
        showToast(`${json.extracted} question${json.extracted! > 1 ? "s" : ""} extraite${json.extracted! > 1 ? "s" : ""} — disponible${json.extracted! > 1 ? "s" : ""} dans Mes questions`);
      }
    } catch {
      showToast("Erreur réseau, réessaie.");
    }
    setExtracting(false);
  }

  const loadData = useCallback(async () => {
    const [exRes, courseRes] = await Promise.all([
      fetch(`/api/courses/${courseId}/exercises`),
      fetch(`/api/courses/${courseId}`),
    ]);
    const [exData, courseData] = await Promise.all([
      exRes.json() as Promise<{ exercises?: Exercise[] }>,
      courseRes.json() as Promise<{ id: string; title: string | null; subject_enum: string | null; pages_count: number | null; error?: string }>,
    ]);
    if (Array.isArray(exData.exercises)) setExercises(exData.exercises);
    if (courseData && !courseData.error) setCourse(courseData);
    setLoading(false);
  }, [courseId]);

  useEffect(() => { loadData(); }, [loadData]);

  const byTab = useMemo(() => {
    const pending   = exercises.filter((e) => e.status === "pending");
    const validated = exercises.filter((e) => e.status === "validated");
    const rejected  = exercises.filter((e) => e.status === "rejected");
    const archived  = exercises.filter((e) => e.status === "archived");
    return { pending, validated, rejected, archived };
  }, [exercises]);

  const visibleValidated = useMemo(() => {
    if (filterStars === 0) return byTab.validated;
    return byTab.validated.filter((e) => e.difficulty === filterStars);
  }, [byTab.validated, filterStars]);

  const tabs: { key: ValTab; label: string; count: number; badge?: boolean }[] = [
    { key: "pending",   label: "À valider",  count: byTab.pending.length,   badge: byTab.pending.length > 0 },
    { key: "validated", label: "Validés",     count: byTab.validated.length },
    { key: "rejected",  label: "Rejetés",     count: byTab.rejected.length },
    { key: "archived",  label: "Archivés",    count: byTab.archived.length },
  ];

  const currentList = tab === "validated" ? visibleValidated
    : tab === "pending"   ? byTab.pending
    : tab === "rejected"  ? byTab.rejected
    : byTab.archived;

  if (loading) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 h-5 w-32 animate-pulse rounded-lg bg-[rgb(var(--surface-3))]" />
          <div className="mb-4 h-8 w-64 animate-pulse rounded-lg bg-[rgb(var(--surface-3))]" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--surface-3))]" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <Link
          href="/accueil/cours"
          className="text-sm font-bold text-[rgb(var(--ink-3))] transition hover:text-[rgb(var(--accent))]"
        >
          ← Mes cours
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="serif text-3xl font-black">Gérer les exercices</h1>
            {course?.title && (
              <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">{course.title}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleStartLive}
              disabled={startingLive}
              className="rounded-2xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--red))]/10 px-4 py-3 text-sm font-black text-[rgb(var(--red))] transition hover:bg-[rgb(var(--red))]/15 disabled:opacity-50"
            >
              {startingLive ? "Chargement…" : "🎬 Cours live"}
            </button>
            <button
              onClick={handleExtractQuestions}
              disabled={extracting}
              className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-black text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
            >
              {extracting ? "Extraction…" : "📄 Extraire les questions"}
            </button>
            <button
              onClick={() => setShowRangeGenerator(true)}
              className="rounded-2xl border border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/10 px-4 py-3 text-sm font-black text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent))]/15"
            >
              🎯 Sélection de pages
            </button>
            <button
              onClick={() => setShowGenerate(true)}
              className="rounded-2xl bg-[rgb(var(--accent))] px-5 py-3 font-black text-white transition hover:opacity-90"
            >
              + Générer des exercices
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-[rgb(var(--border))]">
          {tabs.map(({ key, label, count, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-black transition ${
                tab === key ? "border-b-2 border-[rgb(var(--accent))] bg-[rgb(var(--surface))] text-[rgb(var(--accent))]" : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
              }`}
            >
              {label}
              {badge ? (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[rgb(var(--warm))] px-1 text-[10px] font-black text-white">
                  {count}
                </span>
              ) : count > 0 ? (
                <span className="text-[rgb(var(--ink-3))]">({count})</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Validated star filter */}
        {tab === "validated" && byTab.validated.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[rgb(var(--ink-3))]">Difficulté :</span>
            {([0, 1, 2, 3] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStars(s)}
                className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                  filterStars === s
                    ? "border border-yellow-300 bg-yellow-100 text-yellow-800"
                    : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
                }`}
              >
                {s === 0 ? "Toutes" : "★".repeat(s)}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="mt-5">
          {currentList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-12 text-center text-[rgb(var(--ink-3))]">
              {tab === "pending" && "Aucun exercice en attente. Lance une génération !"}
              {tab === "validated" && (filterStars !== 0 ? "Aucun exercice à cette difficulté." : "Aucun exercice validé.")}
              {tab === "rejected" && "Aucun exercice rejeté."}
              {tab === "archived" && "Aucun exercice archivé."}
            </div>
          ) : (
            <div className="space-y-3">
              {currentList.map((ex) => (
                <ExerciseCard key={ex.id} exercise={ex} courseId={courseId} onChanged={loadData} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showGenerate && (
        <GenerateModal
          courseId={courseId}
          onClose={() => setShowGenerate(false)}
          onSuccess={(count) => {
            setShowGenerate(false);
            showToast(`${count} exercice${count > 1 ? "s" : ""} généré${count > 1 ? "s" : ""} !`);
            loadData();
          }}
        />
      )}

      {showRangeGenerator && (
        <PageRangeGenerator
          courseId={courseId}
          pagesCount={course?.pages_count ?? null}
          courseTitle={course?.title ?? ""}
          onClose={() => setShowRangeGenerator(false)}
          onSuccess={({ questions, exercises: exCount, start, end }) => {
            setShowRangeGenerator(false);
            const parts: string[] = [];
            if (questions > 0) parts.push(`${questions} question${questions > 1 ? "s" : ""}`);
            if (exCount > 0) parts.push(`${exCount} exercice${exCount > 1 ? "s" : ""}`);
            showToast(`${parts.join(" et ")} généré${parts.length > 1 || (questions + exCount) > 1 ? "s" : ""} sur les pages ${start}–${end} !`);
            loadData();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-[rgb(var(--green))] px-6 py-3 font-black text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
