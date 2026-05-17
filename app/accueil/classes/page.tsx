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
  return <div className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--surface-3))]" />;
}

function ClassCard({ cls, onArchiveToggle }: { cls: ClassItem; onArchiveToggle: (id: string, archive: boolean) => void }) {
  const router = useRouter();
  const subj = subjectMeta(cls.subject);
  const isArchived = cls.archived_at !== null;

  // Sprint 1.5 polish (a11y) : card cliquable avec actions imbriquees
  // (Archiver / Detail) => peut pas etre un <button> (nested interactive).
  // Pattern : div role="button" + tabIndex + onKeyDown pour parite clavier.
  function handleCardActivate() {
    if (!isArchived) router.push(`/accueil/classes/${cls.id}`);
  }
  return (
    <div
      role={isArchived ? undefined : "button"}
      tabIndex={isArchived ? undefined : 0}
      aria-label={isArchived ? undefined : `Ouvrir la classe ${cls.name}`}
      className={`relative flex flex-col gap-3 rounded-2xl border p-5 transition ${
        isArchived
          ? "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] opacity-70"
          : "cursor-pointer border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--accent))]/40 hover:bg-[rgb(var(--surface-3))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface-2))]"
      }`}
      onClick={handleCardActivate}
      onKeyDown={(e) => {
        if (isArchived) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardActivate();
        }
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-black text-[rgb(var(--ink))]">{cls.name}</p>
          <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">
            {levelLabel(cls.level)}
            {subj && <> · <span>{subj.emoji} {subj.label}</span></>}
          </p>
        </div>
        {isArchived && (
          <span className="shrink-0 rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--ink-3))]">
            Archivée
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-[rgb(var(--ink-2))]">
        <span>👥 {cls.member_count} élève{cls.member_count !== 1 ? "s" : ""}</span>
      </div>

      {/* Invite code */}
      <div className="flex items-center gap-2 rounded-xl bg-[rgb(var(--surface-3))] px-3 py-2 font-mono text-sm">
        <span className="text-[rgb(var(--ink-3))]">Code :</span>
        <span className="font-black tracking-widest text-[rgb(var(--accent))]">{cls.invite_code}</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[rgb(var(--ink-3))]">Créée le {formatDate(cls.created_at)}</p>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchiveToggle(cls.id, !isArchived);
            }}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-xs text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
          >
            {isArchived ? "Restaurer" : "Archiver"}
          </button>
          {!isArchived && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/accueil/classes/${cls.id}`);
              }}
              className="rounded-lg border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/5 px-2 py-1 text-xs font-bold text-[rgb(var(--accent))] transition hover:border-[rgb(var(--accent))]/60 hover:bg-[rgb(var(--accent))]/10"
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
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <a href="/accueil" className="text-xs text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]">← Espace enseignant</a>
            <h1 className="serif mt-1 text-3xl font-black text-[rgb(var(--ink))]">🏫 Mes classes</h1>
          </div>
          <a
            href="/accueil/classes/nouvelle"
            className="shrink-0 rounded-2xl bg-[rgb(var(--accent))] px-5 py-2.5 font-black text-white transition hover:opacity-90"
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
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
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
              <p className="mt-4 text-lg font-black text-[rgb(var(--ink))]">
                {tab === "active" ? "Aucune classe active" : "Aucune classe archivée"}
              </p>
              {tab === "active" && (
                <a
                  href="/accueil/classes/nouvelle"
                  className="mt-4 inline-block rounded-2xl bg-[rgb(var(--accent))] px-6 py-2.5 font-black text-white transition hover:opacity-90"
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
