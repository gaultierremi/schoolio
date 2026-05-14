"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GRADE_LABEL, GRADE_STYLE } from "@/lib/grading";

type StudentRow = {
  student_user_id: string;
  display_name: string;
  status: "pending" | "in_progress" | "completed";
  score: number | null;
  duration_seconds: number | null;
  attempts_count: number;
  last_attempt_at: string | null;
  completed_at: string | null;
  letter_grade: string;
  requested_solution: boolean;
  requested_explanation: boolean;
};

type TopError = {
  question_id: string;
  question: string;
  wrong_count: number;
  total_answers: number;
  error_rate: number;
};

type Overview = {
  nb_total: number;
  nb_completed: number;
  avg_score: number | null;
  grade_dist: Record<string, number>;
  nb_requested_solution: number;
  nb_requested_explanation: number;
  nb_new: number | null;
  nb_recall: number | null;
};

type AssignmentDetail = {
  id: string;
  title: string;
  description: string | null;
  resource_type: "pdf" | "quiz";
  course_title: string;
  due_date: string | null;
  archived_at: string | null;
  created_at: string;
};

type SortKey = "display_name" | "status" | "score" | "duration_seconds" | "attempts_count" | "last_attempt_at" | "letter_grade";
type StatusFilter = "all" | "pending" | "in_progress" | "completed";
type Tab = "overview" | "students" | "top_errors";

const STATUS_LABEL: Record<string, string> = {
  pending: "À faire",
  in_progress: "En cours",
  completed: "Fait",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-[rgb(var(--border))] text-[rgb(var(--ink-3))]",
  in_progress: "border-[rgb(var(--warm))]/40 text-[rgb(var(--warm))]",
  completed: "border-[rgb(var(--green))]/40 text-[rgb(var(--green))]",
};

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function AssignmentDetailPage() {
  const { id: classId, assignmentId } = useParams<{ id: string; assignmentId: string }>();
  const router = useRouter();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [topErrors, setTopErrors] = useState<TopError[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDue, setEditDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    fetch(`/api/classes/${classId}/assignments/${assignmentId}/dashboard`)
      .then((r) => r.json())
      .then((j: { assignment?: AssignmentDetail; students?: StudentRow[]; overview?: Overview; top_errors?: TopError[] }) => {
        if (j.assignment) {
          setAssignment(j.assignment);
          setEditTitle(j.assignment.title);
          setEditDesc(j.assignment.description ?? "");
          setEditDue(j.assignment.due_date ? j.assignment.due_date.slice(0, 16) : "");
        }
        setStudents(j.students ?? []);
        setOverview(j.overview ?? null);
        setTopErrors(j.top_errors ?? []);
        setLoading(false);
      })
      .catch(() => { setLoading(false); router.replace(`/school/classes/${classId}`); });
  }, [classId, assignmentId, router]);

  async function handleSave() {
    if (!assignment) return;
    setSaving(true);
    const res = await fetch(`/api/classes/${classId}/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        due_date: editDue || null,
      }),
    });
    const json = await res.json() as { assignment?: AssignmentDetail };
    if (json.assignment) {
      setAssignment(json.assignment);
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleArchive() {
    await fetch(`/api/classes/${classId}/assignments/${assignmentId}`, { method: "DELETE" });
    router.push(`/school/classes/${classId}`);
  }

  async function handleExport() {
    setExporting(true);
    const res = await fetch(`/api/classes/${classId}/assignments/${assignmentId}/export`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] ?? "export-devoir.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const visible = students
    .filter((s) => statusFilter === "all" || s.status === statusFilter)
    .sort((a, b) => {
      let va: string | number | null = a[sortKey] as string | number | null;
      let vb: string | number | null = b[sortKey] as string | number | null;
      if (va === null) va = sortAsc ? Infinity : -Infinity;
      if (vb === null) vb = sortAsc ? Infinity : -Infinity;
      if (typeof va === "string" && typeof vb === "string") {
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        onClick={() => toggleSort(k)}
        className="cursor-pointer select-none px-3 py-2 text-left text-xs font-bold text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]"
      >
        {label}
        {sortKey === k && <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>}
      </th>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-4 w-24 animate-pulse rounded bg-[rgb(var(--surface-3))]" />
          <div className="h-8 w-64 animate-pulse rounded bg-[rgb(var(--surface-3))]" />
          <div className="h-48 animate-pulse rounded-2xl bg-[rgb(var(--surface-3))]" />
        </div>
      </main>
    );
  }

  if (!assignment) return null;

  const isQuiz = assignment.resource_type === "quiz";

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-4xl space-y-6">

        <a href={`/school/classes/${classId}`} className="text-xs text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]">
          ← Retour à la classe
        </a>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--ink-2))]">
                {isQuiz ? "🧠 Quiz" : "📄 PDF"}
              </span>
              <h1 className="serif text-2xl font-black text-[rgb(var(--ink))]">{assignment.title}</h1>
            </div>
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">{assignment.course_title}</p>
            {assignment.due_date && (
              <p className="text-xs text-[rgb(var(--warm))]">📅 Avant le {fmtDate(assignment.due_date)}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-50"
            >
              {exporting ? "Export..." : "📥 Exporter CSV"}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
            >
              Modifier
            </button>
            <button
              onClick={handleArchive}
              className="rounded-xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--red))] transition hover:border-[rgb(var(--red))]/70"
            >
              Archiver
            </button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="space-y-4 rounded-2xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--surface))] p-5">
            <h3 className="font-black text-[rgb(var(--ink))]">Modifier le devoir</h3>
            <div>
              <label className="text-xs font-bold text-[rgb(var(--ink-2))]">Titre</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[rgb(var(--ink-2))]">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[rgb(var(--ink-2))]">Date limite</label>
              <input
                type="datetime-local"
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-2xl border border-[rgb(var(--border))] py-2.5 text-sm font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-2xl bg-[rgb(var(--accent))] py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
          {([
            { key: "overview", label: "Vue d'ensemble" },
            { key: "students", label: "Élèves" },
            ...(isQuiz ? [{ key: "top_errors", label: "Top erreurs" }] : []),
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
                activeTab === key
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Vue d'ensemble ────────────────────────────────────────── */}
        {activeTab === "overview" && overview && (
          <div className="space-y-4">
            <div className={`grid gap-3 ${isQuiz ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center">
                <p className="text-2xl font-black text-[rgb(var(--ink))]">{overview.nb_completed}/{overview.nb_total}</p>
                <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">Ont terminé</p>
              </div>
              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center">
                <p className="text-2xl font-black text-[rgb(var(--ink))]">
                  {overview.nb_total > 0 ? Math.round((overview.nb_completed / overview.nb_total) * 100) : 0}%
                </p>
                <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">Complétion</p>
              </div>
              {isQuiz && (
                <>
                  <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center">
                    <p className="text-2xl font-black text-[rgb(var(--ink))]">
                      {overview.avg_score !== null ? `${overview.avg_score}%` : "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">Score moyen</p>
                  </div>
                  <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
                    <p className="mb-2 text-center text-xs text-[rgb(var(--ink-3))]">Répartition</p>
                    <div className="flex justify-center gap-2">
                      {(["A", "B", "C", "D"] as const).map((g) => (
                        <div key={g} className="flex flex-col items-center gap-0.5">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-black ${GRADE_STYLE[g]}`}>
                            {g}
                          </span>
                          <span className="text-[11px] font-bold text-[rgb(var(--ink-2))]">{overview.grade_dist[g] ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {isQuiz && overview.nb_new !== null && (
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/10 px-3 py-1 text-xs font-bold text-[rgb(var(--accent))]">
                  📚 Chapitre : {overview.nb_new} question{overview.nb_new !== 1 ? "s" : ""}
                </span>
                {(overview.nb_recall ?? 0) > 0 && (
                  <span className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                    🔄 Rappel : {overview.nb_recall} question{(overview.nb_recall ?? 0) !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {isQuiz && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/5 p-4">
                  <p className="text-xs font-bold text-[rgb(var(--warm))]">Ont demandé la solution</p>
                  <p className="mt-1 text-2xl font-black text-[rgb(var(--ink))]">{overview.nb_requested_solution}</p>
                  <p className="text-xs text-[rgb(var(--ink-3))]">élève{overview.nb_requested_solution !== 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-2xl border border-sky-300 bg-sky-50 p-4">
                  <p className="text-xs font-bold text-sky-700">Ont demandé de l&apos;aide</p>
                  <p className="mt-1 text-2xl font-black text-[rgb(var(--ink))]">{overview.nb_requested_explanation}</p>
                  <p className="text-xs text-[rgb(var(--ink-3))]">élève{overview.nb_requested_explanation !== 1 ? "s" : ""}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Élèves ─────────────────────────────────────────────────── */}
        {activeTab === "students" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["all", "pending", "in_progress", "completed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    statusFilter === f
                      ? "bg-[rgb(var(--accent))] text-white"
                      : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                  }`}
                >
                  {f === "all" ? "Tous" : STATUS_LABEL[f]}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              {visible.length === 0 ? (
                <p className="py-10 text-center text-sm italic text-[rgb(var(--ink-3))]">Aucun élève dans cette catégorie.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]">
                      <tr>
                        <SortTh label="Élève" k="display_name" />
                        <SortTh label="Statut" k="status" />
                        {isQuiz && (
                          <>
                            <SortTh label="Score" k="score" />
                            <SortTh label="Lettre" k="letter_grade" />
                            <SortTh label="Temps" k="duration_seconds" />
                            <SortTh label="Tentatives" k="attempts_count" />
                          </>
                        )}
                        <SortTh label="Dernière activité" k="last_attempt_at" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgb(var(--border))]">
                      {visible.map((s) => (
                        <tr key={s.student_user_id} className="hover:bg-[rgb(var(--surface-3))]">
                          <td className="px-3 py-3 font-medium text-[rgb(var(--ink))]">{s.display_name}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border bg-[rgb(var(--surface))] px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[s.status]}`}>
                              {STATUS_LABEL[s.status]}
                            </span>
                          </td>
                          {isQuiz && (
                            <>
                              <td className="px-3 py-3 text-[rgb(var(--ink-2))]">
                                {s.score !== null ? (
                                  <span className={Number(s.score) >= 80 ? "font-bold text-[rgb(var(--green))]" : Number(s.score) >= 50 ? "font-bold text-[rgb(var(--warm))]" : "font-bold text-[rgb(var(--red))]"}>
                                    {Math.round(Number(s.score))}%
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${GRADE_STYLE[s.letter_grade as keyof typeof GRADE_STYLE]}`}
                                  title={GRADE_LABEL[s.letter_grade as keyof typeof GRADE_LABEL]}
                                >
                                  {s.letter_grade}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-[rgb(var(--ink-2))]">{fmtDuration(s.duration_seconds)}</td>
                              <td className="px-3 py-3 text-[rgb(var(--ink-2))]">{s.attempts_count || "—"}</td>
                            </>
                          )}
                          <td className="px-3 py-3 text-xs text-[rgb(var(--ink-3))]">
                            {fmtDate(s.last_attempt_at ?? s.completed_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Top erreurs ────────────────────────────────────────────── */}
        {activeTab === "top_errors" && (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            {topErrors.length === 0 ? (
              <p className="py-10 text-center text-sm italic text-[rgb(var(--ink-3))]">
                Aucune donnée de réponse disponible.
              </p>
            ) : (
              <div className="divide-y divide-[rgb(var(--border))]">
                {topErrors.map((e, i) => (
                  <div key={e.question_id} className="flex items-start gap-4 px-4 py-3">
                    <span className="mt-0.5 shrink-0 text-xs font-black text-[rgb(var(--ink-3))]">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-[rgb(var(--ink))]">{e.question}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-[rgb(var(--red))]">{e.error_rate}%</p>
                      <p className="text-[11px] text-[rgb(var(--ink-3))]">{e.wrong_count}/{e.total_answers} erreurs</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
