"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS_BY_ID, LEVELS } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassItem = {
  id: string;
  name: string;
  level: string | null;
  subject: string | null;
  auth_mode: "full" | "light";
  invite_code: string;
  archived_at: string | null;
  created_at: string;
  member_count: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelLabel(level: string | null): string {
  if (!level) return "Tous niveaux";
  const num = Number(level);
  const found = LEVELS.find((l) => l.id === num);
  return found ? found.shortLabel : level;
}

function subjectMeta(subject: string | null) {
  if (!subject) return null;
  return SUBJECTS_BY_ID[subject as SubjectId] ?? null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="h-40 animate-pulse rounded-2xl bg-gray-800" />;
}

function ClassCard({ cls, onArchiveToggle }: { cls: ClassItem; onArchiveToggle: (id: string, archive: boolean) => void }) {
  const router = useRouter();
  const subj = subjectMeta(cls.subject);
  const isArchived = cls.archived_at !== null;

  return (
    <div
      className={`relative flex flex-col gap-3 rounded-2xl border p-5 transition hover:border-purple-500/50 ${
        isArchived
          ? "border-gray-800 bg-gray-900/50 opacity-70"
          : "border-gray-800 bg-gray-900 cursor-pointer hover:bg-gray-800/60"
      }`}
      onClick={() => !isArchived && router.push(`/school/classes/${cls.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-black text-white">{cls.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {levelLabel(cls.level)}
            {subj && <> · <span>{subj.emoji} {subj.label}</span></>}
          </p>
        </div>
        {isArchived && (
          <span className="shrink-0 rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Archivée
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span>👥 {cls.member_count} élève{cls.member_count !== 1 ? "s" : ""}</span>
        <span className="text-gray-600">·</span>
        <span className={cls.auth_mode === "light" ? "text-yellow-400" : "text-blue-400"}>
          {cls.auth_mode === "light" ? "🔓 Pseudo" : "🔐 Compte"}
        </span>
      </div>

      {/* Invite code */}
      <div className="flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 font-mono text-sm">
        <span className="text-gray-500">Code :</span>
        <span className="font-black tracking-widest text-purple-300">{cls.invite_code}</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">Créée le {formatDate(cls.created_at)}</p>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchiveToggle(cls.id, !isArchived);
            }}
            className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-500 transition hover:border-gray-600 hover:text-gray-300"
          >
            {isArchived ? "Restaurer" : "Archiver"}
          </button>
          {!isArchived && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/school/classes/${cls.id}`);
              }}
              className="rounded-lg border border-purple-700/50 px-2 py-1 text-xs text-purple-400 transition hover:border-purple-500 hover:text-purple-300"
            >
              Détail →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [tab, setTab] = useState<"active" | "archived">("active");

  useEffect(() => {
    async function init() {
      const [{ data: userData }, { data: rpcData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("is_current_user_school_teacher"),
      ]);
      if (!userData.user || rpcData !== true) {
        router.replace("/");
        return;
      }

      const res = await fetch("/api/classes");
      if (!res.ok) { router.replace("/"); return; }
      const json = await res.json() as { classes: ClassItem[] };
      setClasses(json.classes ?? []);
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleArchiveToggle(id: string, archive: boolean) {
    const res = await fetch(`/api/classes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: archive }),
    });
    if (!res.ok) return;
    const { class: updated } = await res.json() as { class: ClassItem };
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, archived_at: updated.archived_at } : c)));
  }

  const visible = classes.filter((c) =>
    tab === "active" ? c.archived_at === null : c.archived_at !== null
  );
  const activeCount = classes.filter((c) => c.archived_at === null).length;
  const archivedCount = classes.filter((c) => c.archived_at !== null).length;

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <a href="/school" className="text-xs text-gray-500 hover:text-gray-400">← Espace enseignant</a>
            <h1 className="mt-1 text-3xl font-black text-white">🏫 Mes classes</h1>
          </div>
          <a
            href="/school/classes/new"
            className="shrink-0 rounded-2xl bg-purple-500 px-5 py-2.5 font-black text-gray-950 transition hover:bg-purple-400"
          >
            + Nouvelle classe
          </a>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex gap-2">
          {(["active", "archived"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                tab === t
                  ? "bg-purple-500 text-gray-950"
                  : "border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "active" ? `Actives (${activeCount})` : `Archivées (${archivedCount})`}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-16 text-center">
              <p className="text-5xl">🏫</p>
              <p className="mt-4 text-lg font-black text-white">
                {tab === "active" ? "Aucune classe active" : "Aucune classe archivée"}
              </p>
              {tab === "active" && (
                <a
                  href="/school/classes/new"
                  className="mt-4 inline-block rounded-2xl bg-purple-500 px-6 py-2.5 font-black text-gray-950 transition hover:bg-purple-400"
                >
                  Créer ma première classe
                </a>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((cls) => (
                <ClassCard key={cls.id} cls={cls} onArchiveToggle={handleArchiveToggle} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
