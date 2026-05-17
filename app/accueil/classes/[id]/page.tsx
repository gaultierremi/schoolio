"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS, LEVELS, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassDetail = {
  id: string;
  name: string;
  level: string | null;
  subject: string | null;
  invite_code: string;
  invite_link_token: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type Member = {
  id: string;
  student_user_id: string;
  display_name: string;
  joined_at: string;
  status: "active" | "removed";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });
}

function levelLabel(level: string | null): string {
  if (!level) return "Tous niveaux";
  const num = Number(level);
  const found = LEVELS.find((l) => l.id === num);
  return found ? found.label : level;
}

function subjectLabel(subject: string | null): string {
  if (!subject) return "Toutes matières";
  const meta = SUBJECTS_BY_ID[subject as SubjectId];
  return meta ? `${meta.emoji} ${meta.label}` : subject;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // no-op on failure
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[rgb(var(--surface-3))] ${className ?? ""}`} />;
}

function DeleteModal({
  name,
  onConfirm,
  onCancel,
  deleting,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-3xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--surface))] p-6 shadow-2xl">
        <h2 className="serif text-lg font-black text-[rgb(var(--ink))]">Supprimer la classe ?</h2>
        <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
          <span className="font-bold text-[rgb(var(--ink))]">&quot;{name}&quot;</span> et tous ses membres seront supprimés.
          Cette action est irréversible.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 rounded-2xl border border-[rgb(var(--border))] py-2.5 text-sm font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 rounded-2xl bg-[rgb(var(--red))] py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit form (inline) ────────────────────────────────────────────────────────

function EditForm({
  cls,
  onSave,
  onCancel,
}: {
  cls: ClassDetail;
  onSave: (updated: ClassDetail) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(cls.name);
  const [level, setLevel] = useState(cls.level ?? "");
  const [subject, setSubject] = useState(cls.subject ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      setError("Nom invalide (2–80 caractères).");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        level: level || null,
        subject: subject || null,
      }),
    });
    const json = await res.json() as { class?: ClassDetail; error?: string };
    if (!res.ok || !json.class) {
      setError(json.error ?? "Erreur.");
      setSaving(false);
      return;
    }
    onSave(json.class);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--surface))] p-5">
      <h3 className="font-black text-[rgb(var(--ink))]">Modifier la classe</h3>

      <div>
        <label htmlFor="edit-class-name" className="text-xs font-bold text-[rgb(var(--ink-2))]">Nom</label>
        <input
          id="edit-class-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="edit-class-level" className="text-xs font-bold text-[rgb(var(--ink-2))]">Niveau</label>
          <select
            id="edit-class-level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
          >
            <option value="">Tous niveaux</option>
            {LEVELS.map((l) => (
              <option key={l.id} value={String(l.id)}>{l.shortLabel}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="edit-class-subject" className="text-xs font-bold text-[rgb(var(--ink-2))]">Matière</label>
          <select
            id="edit-class-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
          >
            <option value="">Toutes</option>
            {SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-xs font-bold text-[rgb(var(--red))]">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 rounded-2xl border border-[rgb(var(--border))] py-2.5 text-sm font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-50"
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
  );
}

// ── Assignment types ──────────────────────────────────────────────────────────

type AssignmentItem = {
  id: string;
  title: string;
  resource_type: "pdf" | "quiz";
  course_title: string;
  due_date: string | null;
  nb_completed: number;
  nb_total: number;
  avg_score: number | null;
  created_at: string;
};

function AssignmentsTab({ classId }: { classId: string }) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExportClass() {
    setExporting(true);
    const res = await fetch(`/api/classes/${classId}/export`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] ?? "export-classe.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  useEffect(() => {
    fetch(`/api/classes/${classId}/assignments`)
      .then((r) => r.json())
      .then((j: { assignments?: AssignmentItem[] }) => {
        setAssignments(j.assignments ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [classId]);

  async function handleArchive(id: string) {
    setArchiving(id);
    await fetch(`/api/classes/${classId}/assignments/${id}`, { method: "DELETE" });
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setArchiving(null);
  }

  if (loading) {
    return (
      <div className="mt-4 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-[rgb(var(--surface-3))]" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[rgb(var(--ink-3))]">{assignments.length} devoir{assignments.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          <button
            onClick={handleExportClass}
            disabled={exporting || assignments.length === 0}
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-40"
          >
            {exporting ? "Export..." : "📥 Exporter CSV"}
          </button>
          <a
            href={`/accueil/classes/${classId}/devoirs/nouveau`}
            className="rounded-2xl bg-[rgb(var(--accent))] px-4 py-2 text-sm font-black text-white transition hover:opacity-90"
          >
            + Créer un devoir
          </a>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-4xl">📋</p>
          <p className="mt-3 font-black text-[rgb(var(--ink))]">Aucun devoir</p>
          <p className="mt-1 text-sm text-[rgb(var(--ink-3))]">Crée le premier devoir pour cette classe.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const pct = a.nb_total > 0 ? Math.round((a.nb_completed / a.nb_total) * 100) : 0;
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                aria-label={`Ouvrir le devoir ${a.title}`}
                className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition hover:border-[rgb(var(--accent))]/40 hover:bg-[rgb(var(--surface-3))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface-2))]"
                onClick={() => router.push(`/accueil/classes/${classId}/devoirs/${a.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/accueil/classes/${classId}/devoirs/${a.id}`);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--ink-2))]">
                        {a.resource_type === "pdf" ? "📄 PDF" : "🧠 Quiz"}
                      </span>
                      <p className="truncate font-black text-[rgb(var(--ink))]">{a.title}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[rgb(var(--ink-3))]">{a.course_title}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleArchive(a.id); }}
                    disabled={archiving === a.id}
                    className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs text-[rgb(var(--ink-3))] opacity-0 transition group-hover:opacity-100 hover:border-[rgb(var(--red))]/60 hover:text-[rgb(var(--red))] disabled:opacity-50"
                  >
                    Archiver
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs text-[rgb(var(--ink-2))]">
                  <span>
                    {a.nb_completed}/{a.nb_total} élèves
                    {a.resource_type === "quiz" && a.avg_score !== null && (
                      <> · moy. <span className="font-bold text-[rgb(var(--accent))]">{a.avg_score}%</span></>
                    )}
                  </span>
                  {a.due_date && (
                    <span>📅 {new Date(a.due_date).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</span>
                  )}
                </div>

                <div className="h-1.5 rounded-full bg-[rgb(var(--border))]">
                  <div
                    className="h-1.5 rounded-full bg-[rgb(var(--accent))] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClassDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [regenerating, setRegenerating] = useState<"code" | "link" | null>(null);
  const [memberTab, setMemberTab] = useState<"active" | "removed">("active");
  const [pageTab, setPageTab] = useState<"members" | "devoirs">("members");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    const [{ data: userData }, { data: rpcData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("is_current_user_school_teacher"),
    ]);
    if (!userData.user || rpcData !== true) { router.replace("/"); return; }

    const res = await fetch(`/api/classes/${id}`);
    if (!res.ok) { router.replace("/accueil/classes"); return; }
    const json = await res.json() as { class: ClassDetail; members: Member[] };
    setCls(json.class);
    setMembers(json.members ?? []);
    setLoading(false);
  }, [id, supabase, router]);

  useEffect(() => { load(); }, [load]);

  async function handleCopy(type: "code" | "link") {
    if (!cls) return;
    const value =
      type === "code"
        ? cls.invite_code
        : `${baseUrl}/join/${cls.invite_link_token}`;
    await copyToClipboard(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleRegenerate(type: "code" | "link") {
    if (!cls) return;
    setRegenerating(type);
    const endpoint =
      type === "code"
        ? `/api/classes/${cls.id}/regenerate-code`
        : `/api/classes/${cls.id}/regenerate-link`;
    const res = await fetch(endpoint, { method: "POST" });
    if (res.ok) {
      const json = await res.json() as { invite_code?: string; invite_link_token?: string };
      setCls((prev) =>
        prev
          ? {
              ...prev,
              invite_code: json.invite_code ?? prev.invite_code,
              invite_link_token: json.invite_link_token ?? prev.invite_link_token,
            }
          : prev
      );
    }
    setRegenerating(null);
  }

  async function handleArchiveToggle() {
    if (!cls) return;
    const archive = cls.archived_at === null;
    const res = await fetch(`/api/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: archive }),
    });
    if (res.ok) {
      const json = await res.json() as { class: ClassDetail };
      setCls(json.class);
    }
  }

  async function handleDelete() {
    if (!cls) return;
    setDeleting(true);
    const res = await fetch(`/api/classes/${cls.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/accueil/classes");
    } else {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  async function handleMemberStatusChange(memberId: string, studentUserId: string, status: "active" | "removed") {
    if (!cls) return;
    await fetch(`/api/classes/${cls.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_user_id: studentUserId, status }),
    });
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, status } : m))
    );
  }

  const activeMembers = members.filter((m) => m.status === "active");
  const removedMembers = members.filter((m) => m.status === "removed");
  const visibleMembers = memberTab === "active" ? activeMembers : removedMembers;

  if (loading) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </main>
    );
  }

  if (!cls) return null;

  const isArchived = cls.archived_at !== null;
  const inviteLink = `${baseUrl}/join/${cls.invite_link_token}`;

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-3xl space-y-6">

        {/* Nav */}
        <a href="/accueil/classes" className="text-xs text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]">
          ← Mes classes
        </a>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="serif text-3xl font-black text-[rgb(var(--ink))]">{cls.name}</h1>
              {isArchived && (
                <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--ink-3))]">
                  Archivée
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
              {levelLabel(cls.level)} · {subjectLabel(cls.subject)}
            </p>
            <p className="text-xs text-[rgb(var(--ink-3))]">Créée le {formatDate(cls.created_at)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {!isArchived && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              >
                Modifier
              </button>
            )}
            <button
              onClick={handleArchiveToggle}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
            >
              {isArchived ? "Restaurer" : "Archiver"}
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="rounded-xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--red))] transition hover:border-[rgb(var(--red))]/70"
            >
              Supprimer
            </button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <EditForm
            cls={cls}
            onSave={(updated) => { setCls(updated); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        )}

        {/* Invite section */}
        <div className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black text-[rgb(var(--ink))]">🔗 Inviter des élèves</h2>
            <a
              href={`/accueil/classes/${cls.id}/invitation`}
              className="shrink-0 rounded-xl bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
            >
              Page d&apos;invitation →
            </a>
          </div>

          {/* Code */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--ink-3))]">Code d&apos;invitation</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 rounded-xl bg-[rgb(var(--surface-3))] px-4 py-3 font-mono text-2xl font-black tracking-widest text-[rgb(var(--accent))]">
                {cls.invite_code}
              </div>
              <button
                onClick={() => handleCopy("code")}
                className="shrink-0 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              >
                {copied === "code" ? "✓ Copié" : "Copier"}
              </button>
              <button
                onClick={() => handleRegenerate("code")}
                disabled={regenerating === "code"}
                className="shrink-0 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-50"
              >
                {regenerating === "code" ? "..." : "Régénérer"}
              </button>
            </div>
          </div>

          {/* Link */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--ink-3))]">Lien d&apos;invitation</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 truncate rounded-xl bg-[rgb(var(--surface-3))] px-4 py-3 font-mono text-xs text-[rgb(var(--ink-2))]">
                {inviteLink}
              </div>
              <button
                onClick={() => handleCopy("link")}
                className="shrink-0 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              >
                {copied === "link" ? "✓ Copié" : "Copier"}
              </button>
              <button
                onClick={() => handleRegenerate("link")}
                disabled={regenerating === "link"}
                className="shrink-0 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-50"
              >
                {regenerating === "link" ? "..." : "Régénérer"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-[rgb(var(--ink-3))]">
              Régénérer le lien invalide l&apos;ancien immédiatement.
            </p>
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-2">
          {(["members", "devoirs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setPageTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                pageTab === t
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              }`}
            >
              {t === "members" ? `👥 Élèves (${activeMembers.length})` : "📋 Devoirs"}
            </button>
          ))}
        </div>

        {/* Members section */}
        {pageTab === "members" && (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-black text-[rgb(var(--ink))]">
                👥 Élèves ({activeMembers.length})
              </h2>
              <div className="flex gap-2">
                {(["active", "removed"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMemberTab(t)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      memberTab === t
                        ? "bg-[rgb(var(--accent))] text-white"
                        : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                    }`}
                  >
                    {t === "active"
                      ? `Actifs (${activeMembers.length})`
                      : `Retirés (${removedMembers.length})`}
                  </button>
                ))}
              </div>
            </div>

            {visibleMembers.length === 0 ? (
              <p className="mt-8 text-center text-sm italic text-[rgb(var(--ink-3))]">
                {memberTab === "active"
                  ? "Aucun élève actif. Partage le code ou le lien d'invitation."
                  : "Aucun élève retiré."}
              </p>
            ) : (
              <div className="mt-4 divide-y divide-[rgb(var(--border))]">
                {visibleMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-[rgb(var(--ink))]">{m.display_name}</p>
                      <p className="text-xs text-[rgb(var(--ink-3))]">Rejoint le {formatDate(m.joined_at)}</p>
                    </div>
                    <button
                      onClick={() =>
                        handleMemberStatusChange(
                          m.id,
                          m.student_user_id,
                          m.status === "active" ? "removed" : "active"
                        )
                      }
                      className={`rounded-lg border px-2 py-1 text-xs font-bold transition ${
                        m.status === "active"
                          ? "border-[rgb(var(--red))]/40 text-[rgb(var(--red))] hover:border-[rgb(var(--red))]/70"
                          : "border-[rgb(var(--border))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                      }`}
                    >
                      {m.status === "active" ? "Retirer" : "Réintégrer"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Devoirs section */}
        {pageTab === "devoirs" && (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <h2 className="mb-4 font-black text-[rgb(var(--ink))]">📋 Devoirs</h2>
            <AssignmentsTab classId={id} />
          </div>
        )}

      </div>

      {/* Delete modal */}
      {showDelete && (
        <DeleteModal
          name={cls.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          deleting={deleting}
        />
      )}
    </main>
  );
}
