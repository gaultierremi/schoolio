"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS } from "@/lib/subjects";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "grid" | "list";

const VALID_COLORS = ["purple", "blue", "red", "orange", "green", "yellow", "pink", "gray"] as const;
type TagColor = (typeof VALID_COLORS)[number];

type TeacherTag = {
  id: string;
  name: string;
  emoji: string | null;
  color: TagColor;
};

type CourseRow = {
  id: string;
  title: string | null;
  subject_enum: string | null;
  level: number | null;
  organization_tags: string[] | null;
  pdf_storage_path: string | null;
  pdf_size_bytes: number | null;
  created_at: string | null;
  questions_count: number;
};

type FilterState = {
  subject: string;
  level: string;
  tagIds: Set<string>;
};

type DeleteModal =
  | { kind: "closed" }
  | { kind: "open"; course: CourseRow; loading: boolean };

// ── Constants ─────────────────────────────────────────────────────────────────
// Tags conservent leurs couleurs vives mais avec fond pastel (light theme).

const TAG_CHIP_STYLES: Record<TagColor, string> = {
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  blue:   "bg-blue-100 text-blue-700 border-blue-200",
  red:    "bg-red-100 text-red-700 border-red-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  green:  "bg-green-100 text-green-700 border-green-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  pink:   "bg-pink-100 text-pink-700 border-pink-200",
  gray:   "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-2))] border-[rgb(var(--border))]",
};

const TAG_CHIP_SELECTED: Record<TagColor, string> = {
  purple: "bg-purple-200 text-purple-800 border-purple-400 ring-1 ring-purple-400",
  blue:   "bg-blue-200 text-blue-800 border-blue-400 ring-1 ring-blue-400",
  red:    "bg-red-200 text-red-800 border-red-400 ring-1 ring-red-400",
  orange: "bg-orange-200 text-orange-800 border-orange-400 ring-1 ring-orange-400",
  green:  "bg-green-200 text-green-800 border-green-400 ring-1 ring-green-400",
  yellow: "bg-yellow-200 text-yellow-900 border-yellow-400 ring-1 ring-yellow-400",
  pink:   "bg-pink-200 text-pink-800 border-pink-400 ring-1 ring-pink-400",
  gray:   "bg-[rgb(var(--ink-3))]/20 text-[rgb(var(--ink))] border-[rgb(var(--ink-3))] ring-1 ring-[rgb(var(--ink-3))]",
};

const SUBJECT_BADGE: Record<string, string> = {
  chimie:        "bg-blue-100 text-blue-700",
  physique:      "bg-cyan-100 text-cyan-700",
  biologie:      "bg-green-100 text-green-700",
  mathematiques: "bg-emerald-100 text-emerald-700",
  histoire:      "bg-amber-100 text-amber-800",
  geographie:    "bg-teal-100 text-teal-700",
  francais:      "bg-red-100 text-red-700",
  anglais:       "bg-blue-100 text-blue-700",
  neerlandais:   "bg-orange-100 text-orange-700",
  sciences:      "bg-blue-100 text-blue-700",
  autre:         "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-2))]",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function subjectLabel(subjectEnum: string | null): string {
  if (!subjectEnum) return "Autre";
  const found = SUBJECTS.find((s) => s.id === subjectEnum);
  return found?.label ?? "Autre";
}

function subjectEmoji(subjectEnum: string | null): string {
  if (!subjectEnum) return "✨";
  const found = SUBJECTS.find((s) => s.id === subjectEnum);
  return found?.emoji ?? "✨";
}

async function fetchSignedUrl(courseId: string): Promise<string> {
  const res = await fetch(`/api/courses/${courseId}/signed-url`);
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Impossible de générer le lien");
  return data.url;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-[rgb(var(--accent))] ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[rgb(var(--surface-3))] ${className ?? ""}`} />;
}

type TagChipProps = { tag: TeacherTag; selected?: boolean; onClick?: () => void };

function TagChip({ tag, selected = false, onClick }: TagChipProps) {
  const base = selected ? TAG_CHIP_SELECTED[tag.color] : TAG_CHIP_STYLES[tag.color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-all ${base} ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      {tag.emoji && <span>{tag.emoji}</span>}
      {tag.name}
    </button>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

type FilterBarProps = {
  filters: FilterState;
  tags: TeacherTag[];
  viewMode: ViewMode;
  onSubject: (v: string) => void;
  onLevel: (v: string) => void;
  onToggleTag: (id: string) => void;
  onViewMode: (v: ViewMode) => void;
};

function FilterBar({ filters, tags, viewMode, onSubject, onLevel, onToggleTag, onViewMode }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.subject}
          onChange={(e) => onSubject(e.target.value)}
          className="cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-sm text-[rgb(var(--ink))] focus:border-[rgb(var(--accent))] focus:outline-none"
        >
          <option value="">Toutes les matières</option>
          {SUBJECTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.label}
            </option>
          ))}
        </select>

        <select
          value={filters.level}
          onChange={(e) => onLevel(e.target.value)}
          className="cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-sm text-[rgb(var(--ink))] focus:border-[rgb(var(--accent))] focus:outline-none"
        >
          <option value="">Tous les niveaux</option>
          {[1, 2, 3, 4, 5, 6].map((l) => (
            <option key={l} value={String(l)}>{l}e année</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5">
          <button
            type="button"
            onClick={() => onViewMode("grid")}
            className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-[rgb(var(--accent))] text-white" : "text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"}`}
            aria-label="Vue grille"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onViewMode("list")}
            className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-[rgb(var(--accent))] text-white" : "text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"}`}
            aria-label="Vue liste"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              selected={filters.tagIds.has(tag.id)}
              onClick={() => onToggleTag(tag.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── CourseCard (grid) ─────────────────────────────────────────────────────────

type CourseCardProps = {
  course: CourseRow;
  tags: TeacherTag[];
  loadingUrl: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

function CourseCard({ course, tags, loadingUrl, onPreview, onDownload, onDelete }: CourseCardProps) {
  const courseTags = useMemo(
    () => tags.filter((t) => (course.organization_tags ?? []).includes(t.id)),
    [tags, course.organization_tags]
  );

  const badgeClass = SUBJECT_BADGE[course.subject_enum ?? ""] ?? SUBJECT_BADGE.autre;

  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all hover:border-[rgb(var(--accent))]/40 hover:bg-[rgb(var(--surface-3))]">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold leading-snug text-[rgb(var(--ink))]">
            {course.title ?? "Sans titre"}
          </p>
          <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">{formatDate(course.created_at)}</p>
        </div>
      </div>

      {/* Badges matière + niveau */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {subjectEmoji(course.subject_enum)} {subjectLabel(course.subject_enum)}
        </span>
        {course.level && (
          <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">
            {course.level}e année
          </span>
        )}
        {course.pdf_size_bytes && (
          <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-3))]">
            {formatFileSize(course.pdf_size_bytes)}
          </span>
        )}
      </div>

      {/* Tags d'organisation */}
      {courseTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {courseTags.map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </div>
      )}

      {/* Stats */}
      <p className="text-xs text-[rgb(var(--ink-3))]">
        {course.questions_count > 0
          ? `${course.questions_count} question${course.questions_count > 1 ? "s" : ""} générée${course.questions_count > 1 ? "s" : ""}`
          : "Aucune question générée"}
      </p>

      {/* Exercises link */}
      <Link
        href={`/accueil/cours/${course.id}/exercices`}
        className="flex items-center gap-1.5 self-start rounded-xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/10 px-3 py-1.5 text-xs font-black text-[rgb(var(--accent))] transition-colors hover:bg-[rgb(var(--accent))]/15"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        Exercices
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={onPreview}
          disabled={loadingUrl || !course.pdf_storage_path}
          className="flex items-center gap-1.5 rounded-lg bg-[rgb(var(--surface-3))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--ink-2))] transition-colors hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--ink))] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingUrl ? <Spinner className="h-3 w-3" /> : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
          Voir
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={loadingUrl || !course.pdf_storage_path}
          className="flex items-center gap-1.5 rounded-lg bg-[rgb(var(--surface-3))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--ink-2))] transition-colors hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--ink))] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Télécharger
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex items-center gap-1 rounded-lg bg-[rgb(var(--red))]/10 px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--red))] transition-colors hover:bg-[rgb(var(--red))]/15"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Supprimer
        </button>
      </div>
    </div>
  );
}

// ── ListView row ──────────────────────────────────────────────────────────────

type ListRowProps = {
  course: CourseRow;
  tags: TeacherTag[];
  loadingUrl: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

function ListRow({ course, tags, loadingUrl, onPreview, onDownload, onDelete }: ListRowProps) {
  const courseTags = useMemo(
    () => tags.filter((t) => (course.organization_tags ?? []).includes(t.id)),
    [tags, course.organization_tags]
  );
  const badgeClass = SUBJECT_BADGE[course.subject_enum ?? ""] ?? SUBJECT_BADGE.autre;

  return (
    <tr className="border-t border-[rgb(var(--border))] transition-colors hover:bg-[rgb(var(--surface-3))]">
      <td className="px-4 py-3">
        <p className="line-clamp-1 text-sm font-medium text-[rgb(var(--ink))]">{course.title ?? "Sans titre"}</p>
      </td>
      <td className="px-4 py-3">
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {subjectEmoji(course.subject_enum)} {subjectLabel(course.subject_enum)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[rgb(var(--ink-2))]">
        {course.level ? `${course.level}e` : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {courseTags.slice(0, 3).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
          {courseTags.length > 3 && (
            <span className="text-xs text-[rgb(var(--ink-3))]">+{courseTags.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-[rgb(var(--ink-2))]">
        {course.questions_count}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-[rgb(var(--ink-3))]">
        {formatDate(course.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPreview}
            disabled={loadingUrl || !course.pdf_storage_path}
            className="rounded-lg p-1.5 text-[rgb(var(--ink-2))] transition-colors hover:bg-[rgb(var(--surface-3))] hover:text-[rgb(var(--ink))] disabled:cursor-not-allowed disabled:opacity-40"
            title="Prévisualiser"
          >
            {loadingUrl ? <Spinner className="h-4 w-4" /> : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={loadingUrl || !course.pdf_storage_path}
            className="rounded-lg p-1.5 text-[rgb(var(--ink-2))] transition-colors hover:bg-[rgb(var(--surface-3))] hover:text-[rgb(var(--ink))] disabled:cursor-not-allowed disabled:opacity-40"
            title="Télécharger"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-[rgb(var(--red))]/70 transition-colors hover:bg-[rgb(var(--red))]/10 hover:text-[rgb(var(--red))]"
            title="Supprimer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

type DeleteModalProps = {
  modal: DeleteModal;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteModalOverlay({ modal, onCancel, onConfirm }: DeleteModalProps) {
  if (modal.kind === "closed") return null;

  const { course, loading } = modal;
  const hasQuestions = course.questions_count > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-2xl">
        <h2 className="serif text-lg font-bold text-[rgb(var(--ink))]">Supprimer ce cours ?</h2>
        <p className="mt-1 text-sm font-medium text-[rgb(var(--ink-2))]">{course.title ?? "Sans titre"}</p>

        {hasQuestions && (
          <div className="mt-4 rounded-xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/10 px-4 py-3">
            <p className="text-sm text-[rgb(var(--warm))]">
              <span className="font-semibold">{course.questions_count} question{course.questions_count > 1 ? "s" : ""}</span> générée{course.questions_count > 1 ? "s" : ""} depuis ce cours seront conservées et détachées — elles ne seront pas supprimées.
            </p>
          </div>
        )}

        <p className="mt-4 text-sm text-[rgb(var(--ink-2))]">
          Le fichier PDF sera définitivement supprimé. Cette action est irréversible.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--ink-2))] transition-colors hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-[rgb(var(--red))] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Spinner className="h-4 w-4" />}
            Confirmer la suppression
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <svg className="h-16 w-16 text-[rgb(var(--ink-3))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div>
        <p className="font-medium text-[rgb(var(--ink))]">Tu n&apos;as pas encore importé de cours</p>
        <p className="mt-1 text-sm text-[rgb(var(--ink-3))]">Glisse des PDF pour que Maïa les analyse automatiquement</p>
      </div>
      <Link
        href="/accueil/import"
        className="mt-2 rounded-xl bg-[rgb(var(--accent))] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
      >
        Importer des cours →
      </Link>
    </div>
  );
}

function EmptyFilterState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-sm text-[rgb(var(--ink-2))]">Aucun cours ne correspond aux filtres sélectionnés.</p>
      <button
        type="button"
        onClick={onReset}
        className="text-sm text-[rgb(var(--accent))] underline underline-offset-2 transition-colors hover:opacity-80"
      >
        Réinitialiser les filtres
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoursesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [authLoading, setAuthLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);

  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [teacherTags, setTeacherTags] = useState<TeacherTag[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filters, setFilters] = useState<FilterState>({ subject: "", level: "", tagIds: new Set() });
  const [loadingUrlIds, setLoadingUrlIds] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<DeleteModal>({ kind: "closed" });
  const [toast, setToast] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const [{ data: userData }, { data: rpcData, error: rpcError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("is_current_user_school_teacher"),
      ]);

      if (!userData.user) { router.replace("/"); return; }

      const teacher = rpcData === true && !rpcError;
      setIsTeacher(teacher);
      setAuthLoading(false);

      if (!teacher) return;

      const [coursesRes, tagsRes] = await Promise.all([
        fetch("/api/courses"),
        fetch("/api/teacher-tags"),
      ]);

      const [coursesData, tagsData] = await Promise.all([
        coursesRes.json() as Promise<{ courses?: CourseRow[]; error?: string }>,
        tagsRes.json() as Promise<{ tags?: TeacherTag[]; error?: string }>,
      ]);

      if (Array.isArray(coursesData.courses)) setCourses(coursesData.courses);
      if (Array.isArray(tagsData.tags)) setTeacherTags(tagsData.tags);
      setDataLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtered courses ──────────────────────────────────────────────────────

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (filters.subject && c.subject_enum !== filters.subject) return false;
      if (filters.level && String(c.level) !== filters.level) return false;
      if (filters.tagIds.size > 0) {
        const courseTags = c.organization_tags ?? [];
        const hasAll = Array.from(filters.tagIds).every((tid) => courseTags.includes(tid));
        if (!hasAll) return false;
      }
      return true;
    });
  }, [courses, filters]);

  const totalQuestions = useMemo(
    () => courses.reduce((sum, c) => sum + c.questions_count, 0),
    [courses]
  );

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const handlePreview = useCallback(async (course: CourseRow) => {
    if (!course.pdf_storage_path) return;
    setLoadingUrlIds((prev) => new Set(prev).add(course.id));
    try {
      const url = await fetchSignedUrl(course.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      showToast("Impossible d'ouvrir le PDF");
    } finally {
      setLoadingUrlIds((prev) => { const s = new Set(prev); s.delete(course.id); return s; });
    }
  }, []);

  const handleDownload = useCallback(async (course: CourseRow) => {
    if (!course.pdf_storage_path) return;
    setLoadingUrlIds((prev) => new Set(prev).add(course.id));
    try {
      const url = await fetchSignedUrl(course.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = (course.title ?? "cours") + ".pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      showToast("Impossible de télécharger le PDF");
    } finally {
      setLoadingUrlIds((prev) => { const s = new Set(prev); s.delete(course.id); return s; });
    }
  }, []);

  function openDeleteModal(course: CourseRow) {
    setDeleteModal({ kind: "open", course, loading: false });
  }

  async function confirmDelete() {
    if (deleteModal.kind !== "open") return;
    const { course } = deleteModal;
    setDeleteModal({ kind: "open", course, loading: true });

    try {
      const res = await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur de suppression");
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      setDeleteModal({ kind: "closed" });
      showToast("Cours supprimé");
    } catch (err) {
      setDeleteModal({ kind: "open", course, loading: false });
      showToast(err instanceof Error ? err.message : "Erreur de suppression");
    }
  }

  function resetFilters() {
    setFilters({ subject: "", level: "", tagIds: new Set() });
  }

  function toggleTagFilter(id: string) {
    setFilters((prev) => {
      const next = new Set(prev.tagIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, tagIds: next };
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-8 w-48" />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-48" />)}
          </div>
        </div>
      </main>
    );
  }

  if (!isTeacher) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-10 text-[rgb(var(--ink))]">
        <div className="mx-auto max-w-xl rounded-3xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-6">
          <h1 className="serif text-2xl font-black text-[rgb(var(--red))]">Accès refusé</h1>
          <p className="mt-2 text-[rgb(var(--ink-2))]">Cet espace est réservé aux professeurs autorisés.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-10 text-[rgb(var(--ink))]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">

        {/* Header */}
        <div>
          <Link
            href="/accueil"
            className="mb-4 inline-block text-sm text-[rgb(var(--ink-2))] transition-colors hover:text-[rgb(var(--accent))]"
          >
            ← Retour au dashboard
          </Link>
          <h1 className="serif text-2xl font-bold text-[rgb(var(--ink))]">Mes cours</h1>
          {!dataLoading && (
            <p className="mt-1 text-sm text-[rgb(var(--ink-3))]">
              {courses.length} cours · {totalQuestions} question{totalQuestions > 1 ? "s" : ""} générée{totalQuestions > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Filters + view toggle */}
        {!dataLoading && courses.length > 0 && (
          <FilterBar
            filters={filters}
            tags={teacherTags}
            viewMode={viewMode}
            onSubject={(v) => setFilters((f) => ({ ...f, subject: v }))}
            onLevel={(v) => setFilters((f) => ({ ...f, level: v }))}
            onToggleTag={toggleTagFilter}
            onViewMode={setViewMode}
          />
        )}

        {/* Content */}
        {dataLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-52" />)}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState />
        ) : filteredCourses.length === 0 ? (
          <EmptyFilterState onReset={resetFilters} />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {filteredCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                tags={teacherTags}
                loadingUrl={loadingUrlIds.has(course.id)}
                onPreview={() => handlePreview(course)}
                onDownload={() => handleDownload(course)}
                onDelete={() => openDeleteModal(course)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <table className="w-full min-w-[640px]">
              <thead className="bg-[rgb(var(--surface-2))]">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-3))]">Titre</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-3))]">Matière</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-3))]">Niv.</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-3))]">Tags</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-3))]">Questions</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-3))]">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-3))]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((course) => (
                  <ListRow
                    key={course.id}
                    course={course}
                    tags={teacherTags}
                    loadingUrl={loadingUrlIds.has(course.id)}
                    onPreview={() => handlePreview(course)}
                    onDownload={() => handleDownload(course)}
                    onDelete={() => openDeleteModal(course)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeleteModalOverlay
        modal={deleteModal}
        onCancel={() => setDeleteModal({ kind: "closed" })}
        onConfirm={confirmDelete}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm text-[rgb(var(--ink))] shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}
