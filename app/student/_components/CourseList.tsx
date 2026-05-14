"use client";

import { useState } from "react";
import {
  FlaskConical, Zap, Leaf, Calculator, Landmark, Globe,
  BookOpenText, BookOpen, type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AvailableCourse } from "@/lib/types/student-dashboard";

// TODO: swap card for <CourseProgressCard variant="student" /> when codex/course-progress-card merges
// Expected props: title, subjectEnum, level, pdfPages, progressPercent?, lastActivityDate?, variant, onClick

const SUBJECT_ICON: Record<string, LucideIcon> = {
  chimie:        FlaskConical,
  physique:      Zap,
  biologie:      Leaf,
  mathematiques: Calculator,
  histoire:      Landmark,
  geographie:    Globe,
  francais:      BookOpenText,
  anglais:       BookOpen,
  neerlandais:   BookOpen,
  autre:         BookOpen,
};

function SubjectIcon({ subject }: { subject: string | null }) {
  const Icon = SUBJECT_ICON[subject ?? "autre"] ?? BookOpen;
  return <Icon className="h-5 w-5 text-[rgb(var(--accent))]" aria-hidden />;
}

type Props = { courses: AvailableCourse[] };

export default function CourseList({ courses }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleOpen(courseId: string) {
    if (loadingId) return;
    setLoadingId(courseId);
    try {
      const res = await fetch(`/api/student/courses/${courseId}/pdf-url`);
      if (!res.ok) throw new Error("Impossible d'obtenir le PDF");
      const { url } = (await res.json()) as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("PDF temporairement indisponible");
    } finally {
      setLoadingId(null);
    }
  }

  if (courses.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<BookOpen className="h-8 w-8 text-[rgb(var(--ink-3))]" />}
        title="Aucun cours disponible"
        description="Tes professeurs n'ont pas encore partagé de cours PDF."
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {courses.map((c) => {
        const isLoading = loadingId === c.id;
        return (
          <li key={c.id}>
            <button
              onClick={() => handleOpen(c.id)}
              disabled={!!loadingId}
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--surface-3))] disabled:opacity-60"
            >
              <div className="flex items-start gap-3">
                <SubjectIcon subject={c.subject_enum ?? null} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[rgb(var(--ink))]">{c.title}</p>
                  <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">
                    {c.subject_enum ?? "Autre"}
                    {c.level ? ` · ${c.level}e` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[rgb(var(--ink-3))]">
                  {isLoading ? (
                    <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
