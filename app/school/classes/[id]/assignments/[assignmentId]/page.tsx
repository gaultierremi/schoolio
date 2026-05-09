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

const STATUS_LABEL: Record<string, string> = {
  pending: "À faire",
  in_progress: "En cours",
  completed: "Fait",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-gray-700 text-gray-500",
  in_progress: "border-amber-600/40 text-amber-400",
  completed: "border-green-600/40 text-green-400",
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

  useEffect(() => {
    fetch(`/api/classes/${classId}/assignments/${assignmentId}/details`)
      .then((r) => r.json())
      .then((j: { assignment?: AssignmentDetail; students?: StudentRow[] }) => {
        if (j.assignment) {
          setAssignment(j.assignment);
          setEditTitle(j.assignment.title);
          setEditDesc(j.assignment.description ?? "");
          setEditDue(j.assignment.due_date ? j.assignment.due_date.slice(0, 16) : "");
        }
        setStudents(j.students ?? []);
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
        className="px-3 py-2 text-left text-xs font-bold text-gray-500 cursor-pointer select-none hover:text-gray-300"
      >
        {label}
        {sortKey === k && <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>}
      </th>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />
          <div className="h-8 w-64 animate-pulse rounded bg-gray-800" />
          <div className="h-48 animate-pulse rounded-2xl bg-gray-800" />
        </div>
      </main>
    );
  }

  if (!assignment) return null;

  const nbCompleted = students.filter((s) => s.status === "completed").length;
  const nbTotal = students.length;
  const avgScore =
    assignment.resource_type === "quiz"
      ? (() => {
          const scores = students.filter((s) => s.score !== null).map((s) => Number(s.score));
          return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        })()
      : null;
  const gradeDist =
    assignment.resource_type === "quiz"
      ? (["A", "B", "C", "D"] as const).map((g) => ({
          grade: g,
          count: students.filter((s) => s.letter_grade === g).length,
        }))
      : null;

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-4xl space-y-6">

        <a href={`/school/classes/${classId}`} className="text-xs text-gray-500 hover:text-gray-400">
          ← Retour à la classe
        </a>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {assignment.resource_type === "pdf" ? "📄 PDF" : "🧠 Quiz"}
              </span>
              <h1 className="text-2xl font-black text-white">{assignment.title}</h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">{assignment.course_title}</p>
            {assignment.due_date && (
              <p className="text-xs text-amber-400">📅 Avant le {fmtDate(assignment.due_date)}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-400 transition hover:border-gray-500 hover:text-white disabled:opacity-50"
            >
              {exporting ? "Export..." : "📥 Exporter CSV"}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-400 transition hover:border-gray-500 hover:text-white"
            >
              Modifier
            </button>
            <button
              onClick={handleArchive}
              className="rounded-xl border border-red-800/50 px-3 py-1.5 text-xs font-bold text-red-500 transition hover:border-red-600 hover:text-red-400"
            >
              Archiver
            </button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="rounded-2xl border border-purple-500/30 bg-gray-900 p-5 space-y-4">
            <h3 className="font-black text-white">Modifier le devoir</h3>
            <div>
              <label className="text-xs font-bold text-gray-400">Titre</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400">Date limite</label>
              <input
                type="datetime-local"
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-2xl border border-gray-700 py-2.5 text-sm font-bold text-gray-400 transition hover:text-white"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-2xl bg-purple-500 py-2.5 text-sm font-black text-gray-950 transition hover:bg-purple-400 disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div className={`grid gap-3 ${gradeDist ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-center">
            <p className="text-2xl font-black text-white">{nbCompleted}/{nbTotal}</p>
            <p className="mt-0.5 text-xs text-gray-500">Élèves ont terminé</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-center">
            <p className="text-2xl font-black text-white">
              {nbTotal > 0 ? Math.round((nbCompleted / nbTotal) * 100) : 0}%
            </p>
            <p className="mt-0.5 text-xs text-gray-500">Complétion</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-center">
            <p className="text-2xl font-black text-white">
              {avgScore !== null ? `${avgScore}%` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">Score moyen</p>
          </div>
          {gradeDist && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <p className="mb-2 text-center text-xs text-gray-500">Répartition</p>
              <div className="flex justify-center gap-2">
                {gradeDist.map(({ grade, count }) => (
                  <div key={grade} className="flex flex-col items-center gap-0.5">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-black ${GRADE_STYLE[grade as keyof typeof GRADE_STYLE]}`}>
                      {grade}
                    </span>
                    <span className="text-[11px] font-bold text-gray-400">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {(["all", "pending", "in_progress", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                statusFilter === f
                  ? "bg-purple-500 text-gray-950"
                  : "border border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {f === "all" ? "Tous" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm italic text-gray-600">Aucun élève dans cette catégorie.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800">
                  <tr>
                    <SortTh label="Élève" k="display_name" />
                    <SortTh label="Statut" k="status" />
                    {assignment.resource_type === "quiz" && (
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
                <tbody className="divide-y divide-gray-800/60">
                  {visible.map((s) => (
                    <tr key={s.student_user_id} className="hover:bg-gray-800/30">
                      <td className="px-3 py-3 font-medium text-white">{s.display_name}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                      </td>
                      {assignment.resource_type === "quiz" && (
                        <>
                          <td className="px-3 py-3 text-gray-300">
                            {s.score !== null ? (
                              <span className={Number(s.score) >= 80 ? "text-green-400 font-bold" : Number(s.score) >= 50 ? "text-amber-400 font-bold" : "text-red-400 font-bold"}>
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
                          <td className="px-3 py-3 text-gray-400">{fmtDuration(s.duration_seconds)}</td>
                          <td className="px-3 py-3 text-gray-400">{s.attempts_count || "—"}</td>
                        </>
                      )}
                      <td className="px-3 py-3 text-gray-500 text-xs">
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
    </main>
  );
}
