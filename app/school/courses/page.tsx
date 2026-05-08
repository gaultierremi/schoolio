"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

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

const TAG_CHIP_STYLES: Record<TagColor, string> = {
  purple: "bg-purple-500/15 text-purple-300 border-purple-500/25",
  blue:   "bg-blue-500/15 text-blue-300 border-blue-500/25",
  red:    "bg-red-500/15 text-red-300 border-red-500/25",
  orange: "bg-orange-500/15 text-orange-300 border-orange-500/25",
  green:  "bg-green-500/15 text-green-300 border-green-500/25",
  yellow: "bg-yellow-500/15 text-yellow-300 border-yellow-500/25",
  pink:   "bg-pink-500/15 text-pink-300 border-pink-500/25",
  gray:   "bg-gray-500/15 text-gray-300 border-gray-500/25",
};

const TAG_CHIP_SELECTED: Record<TagColor, string> = {
  purple: "bg-purple-500/30 text-purple-200 border-purple-400 ring-1 ring-purple-400",
  blue:   "bg-blue-500/30 text-blue-200 border-blue-400 ring-1 ring-blue-400",
  red:    "bg-red-500/30 text-red-200 border-red-400 ring-1 ring-red-400",
  orange: "bg-orange-500/30 text-orange-200 border-orange-400 ring-1 ring-orange-400",
  green:  "bg-green-500/30 text-green-200 border-green-400 ring-1 ring-green-400",
  yellow: "bg-yellow-500/30 text-yellow-200 border-yellow-400 ring-1 ring-yellow-400",
  pink:   "bg-pink-500/30 text-pink-200 border-pink-400 ring-1 ring-pink-400",
  gray:   "bg-gray-500/30 text-gray-200 border-gray-400 ring-1 ring-gray-400",
};

const SUBJECT_BADGE: Record<string, string> = {
  chimie:        "bg-blue-500/20 text-blue-300",
  physique:      "bg-cyan-500/20 text-cyan-300",
  biologie:      "bg-green-500/20 text-green-300",
  mathematiques: "bg-emerald-500/20 text-emerald-300",
  histoire:      "bg-amber-500/20 text-amber-300",
  geographie:    "bg-teal-500/20 text-teal-300",
  francais:      "bg-red-500/20 text-red-300",
  anglais:       "bg-blue-500/20 text-blue-300",
  neerlandais:   "bg-orange-500/20 text-orange-300",
  sciences:      "bg-blue-500/20 text-blue-300",
  autre:         "bg-gray-500/20 text-gray-300",
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
    <svg className={`animate-spin text-purple-400 ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/5 ${className ?? ""}`} />;
}

type TagChipProps = { tag: TeacherTag; selected?: boolean; onClick?: () => void };

function TagChip({ tag, selected = false, onClick }: TagChipProps) {
  const base = selected ? TAG_CHIP_SELECTED[tag.color] : TAG_CHIP_STYLES[tag.color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium transition-all ${base} ${onClick ? "cursor-pointer" : "cursor-default"}`}
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
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400 cursor-pointer"
        >
          <option value="" className="bg-gray-900">Toutes les matières</option>
          {SUBJECTS.map((s) => (
            <option key={s.id} value={s.id} className="bg-gray-900">
              {s.emoji} {s.label}
            </option>
          ))}
        </select>

        <select
          value={filters.level}
          onChange={(e) => onLevel(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400 cursor-pointer"
        >
          <option value="" className="bg-gray-900">Tous les niveaux</option>
          {[1, 2, 3, 4, 5, 6].map((l) => (
            <option key={l} value={String(l)} className="bg-gray-900">{l}e année</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/20 p-0.5">
          <button
            type="button"
            onClick={() => onViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-purple-600 text-white" : "text-white/50 hover:text-white"}`}
            aria-label="Vue grille"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-purple-600 text-white" : "text-white/50 hover:text-white"}`}
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
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 hover:border-purple-500/40 hover:bg-white/8 transition-all">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white leading-snug line-clamp-2">
            {course.title ?? "Sans titre"}
          </p>
          <p className="text-xs text-white/40 mt-0.5">{formatDate(course.created_at)}</p>
        </div>
      </div>

      {/* Badges matière + niveau */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
          {subjectEmoji(course.subject_enum)} {subjectLabel(course.subject_enum)}
        </span>
        {course.level && (
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-xs">
            {course.level}e année
          </span>
        )}
        {course.pdf_size_bytes && (
          <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/30 text-xs">
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
      <p className="text-xs text-white/40">
        {course.questions_count > 0
          ? `${course.questions_count} question${course.questions_count > 1 ? "s" : ""} générée${course.questions_count > 1 ? "s" : ""}`
          : "Aucune question générée"}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onPreview}
          disabled={loadingUrl || !course.pdf_storage_path}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Télécharger
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors"
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
    <tr className="border-t border-white/5 hover:bg-white/3 transition-colors">
      <td className="py-3 px-4">
        <p className="text-sm text-white font-medium line-clamp-1">{course.title ?? "Sans titre"}</p>
      </td>
      <td className="py-3 px-4">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${badgeClass}`}>
          {subjectEmoji(course.subject_enum)} {subjectLabel(course.subject_enum)}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-white/50">
        {course.level ? `${course.level}e` : "—"}
      </td>
      <td className="py-3 px-4">
        <div className="flex flex-wrap gap-1">
          {courseTags.slice(0, 3).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
          {courseTags.length > 3 && (
            <span className="text-xs text-white/30">+{courseTags.length - 3}</span>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-white/50 tabular-nums">
        {course.questions_count}
      </td>
      <td className="py-3 px-4 text-xs text-white/40 whitespace-nowrap">
        {formatDate(course.created_at)}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPreview}
            disabled={loadingUrl || !course.pdf_storage_path}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white/60 hover:text-white transition-colors"
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
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white/60 hover:text-white transition-colors"
            title="Télécharger"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/15 text-red-500/60 hover:text-red-400 transition-colors"
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white">Supprimer ce cours ?</h2>
        <p className="mt-1 text-sm text-white/60 font-medium">{course.title ?? "Sans titre"}</p>

        {hasQuestions && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-300">
              <span className="font-semibold">{course.questions_count} question{course.questions_count > 1 ? "s" : ""}</span> générée{course.questions_count > 1 ? "s" : ""} depuis ce cours seront conservées et détachées — elles ne seront pas supprimées.
            </p>
          </div>
        )}

        <p className="mt-4 text-sm text-white/50">
          Le fichier PDF sera définitivement supprimé. Cette action est irréversible.
        </p>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/5 disabled:opacity-40 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
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
      <svg className="h-16 w-16 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div>
        <p className="text-white/50 font-medium">Tu n&apos;as pas encore importé de cours</p>
        <p className="text-white/30 text-sm mt-1">Glisse des PDF pour que l&apos;IA les analyse automatiquement</p>
      </div>
      <Link
        href="/school/import"
        className="mt-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
      >
        Importer des cours →
      </Link>
    </div>
  );
}

function EmptyFilterState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-white/40 text-sm">Aucun cours ne correspond aux filtres sélectionnés.</p>
      <button
        type="button"
        onClick={onReset}
        className="text-purple-400 hover:text-purple-300 text-sm underline underline-offset-2 transition-colors"
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
      <main className="min-h-screen bg-gray-950 px-4 py-10">
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-8 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-48" />)}
          </div>
        </div>
      </main>
    );
  }

  if (!isTeacher) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-10 text-white">
        <div className="max-w-xl mx-auto rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-black text-red-300">Accès refusé</h1>
          <p className="mt-2 text-gray-300">Cet espace est réservé aux professeurs autorisés.</p>
        </div>
      </main>
    );
  }

  const hasActiveFilters = filters.subject !== "" || filters.level !== "" || filters.tagIds.size > 0;

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div>
          <Link
            href="/school"
            className="inline-block text-sm text-gray-400 hover:text-purple-400 transition-colors mb-4"
          >
            ← Retour au dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white">Mes cours</h1>
          {!dataLoading && (
            <p className="text-sm text-white/40 mt-1">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-52" />)}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState />
        ) : filteredCourses.length === 0 ? (
          <EmptyFilterState onReset={resetFilters} />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="text-left">
                  <th className="py-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-wide">Titre</th>
                  <th className="py-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-wide">Matière</th>
                  <th className="py-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-wide">Niv.</th>
                  <th className="py-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-wide">Tags</th>
                  <th className="py-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-wide">Questions</th>
                  <th className="py-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-wide">Date</th>
                  <th className="py-3 px-4 text-xs font-semibold text-white/40 uppercase tracking-wide">Actions</th>
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-gray-800 border border-white/10 text-sm text-white shadow-xl whitespace-nowrap">
          {toast}
        </div>
      )}
    </main>
  );
}
