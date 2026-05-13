"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";
import DashboardHeader from "./_components/DashboardHeader";
import ToHandleSection from "./_components/ToHandleSection";
import KpiGrid from "./_components/KpiGrid";
import ClassesPreview from "./_components/ClassesPreview";
import QuickActions from "./_components/QuickActions";
import ActivityTimeline from "./_components/ActivityTimeline";
import { CurrentClassBanner } from "./_components/CurrentClassBanner";
import { WelcomeScheduleOnboarding } from "./_components/WelcomeScheduleOnboarding";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stats = {
  total_courses: number;
  active_students: number;
  active_classes: number;
  total_assignments: number;
  validated_questions: number;
};

type ToHandle = {
  pending_exercises: number;
  pending_questions: number;
  overdue_assignments: number;
};

type ClassPreview = {
  id: string;
  name: string;
  level: number | null;
  subject: string | null;
  member_count: number;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  label: string;
  context: Record<string, unknown>;
  created_at: string;
};

type ScheduleSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: string;
  class_id: string | null;
  subject_label: string | null;
  custom_color: string | null;
  notes: string | null;
  classes?: { id: string; name: string; subject: string | null } | null;
};

type ScheduleSetup = {
  onboarding_dismissed: boolean;
  has_slots: boolean;
};

type DashboardData = {
  stats: Stats;
  to_handle: ToHandle;
  classes_preview: ClassPreview[];
  schedule_setup?: ScheduleSetup;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonPage() {
  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="h-5 w-32 animate-pulse rounded-lg bg-[rgb(var(--surface-3))]" />
        <div className="h-10 w-64 animate-pulse rounded-lg bg-[rgb(var(--surface-3))]" />
        <div className="h-10 animate-pulse rounded-xl bg-[rgb(var(--surface-3))]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-[rgb(var(--surface))]" />
          ))}
        </div>
      </div>
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchoolDashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [weekPatternOverride, setWeekPatternOverride] = useState<"auto" | "force_A" | "force_B">("auto");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    async function init() {
      const [{ data: userData }, { data: rpcData, error: rpcError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("is_current_user_school_teacher"),
        ]);

      const teacher = rpcData === true && !rpcError;
      setUser(userData.user);
      setIsTeacher(teacher);
      setAuthLoading(false);

      if (!teacher) return;

      setDashLoading(true);
      const [dashRes, scheduleRes, contextRes] = await Promise.all([
        fetch("/api/school/dashboard-summary"),
        fetch("/api/school/schedule"),
        fetch(`/api/school/schedule/current-context?tz_offset=${-new Date().getTimezoneOffset()}`),
      ]);

      if (dashRes.ok) {
        const data = (await dashRes.json()) as DashboardData;
        setDashboard(data);
        if (data.schedule_setup && !data.schedule_setup.onboarding_dismissed && !data.schedule_setup.has_slots) {
          setShowOnboarding(true);
        }
      }

      if (scheduleRes.ok) {
        const data = (await scheduleRes.json()) as { slots: ScheduleSlot[]; week_pattern_override: string };
        setScheduleSlots(data.slots ?? []);
        setWeekPatternOverride((data.week_pattern_override as "auto" | "force_A" | "force_B") ?? "auto");
      }

      if (contextRes.ok) {
        const data = (await contextRes.json()) as { suggestions?: string[] };
        setSuggestions(data.suggestions ?? []);
      }

      setDashLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadActivity = useCallback(
    async (filter: string, limit: number): Promise<ActivityEvent[]> => {
      const res = await fetch(
        `/api/school/recent-activity?limit=${limit}&filter=${filter}`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { events?: ActivityEvent[] };
      return data.events ?? [];
    },
    []
  );

  if (authLoading) return <SkeletonPage />;

  if (!isTeacher) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
        <div className="mx-auto max-w-xl rounded-3xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/5 p-6">
          <h1 className="serif text-2xl font-black text-[rgb(var(--red))]">Accès refusé</h1>
          <p className="mt-2 text-[rgb(var(--ink-2))]">
            Cet espace est réservé aux professeurs autorisés.
          </p>
        </div>
      </main>
    );
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email;

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/"
          className="mb-6 inline-block text-sm font-bold text-[rgb(var(--ink-3))] transition-colors hover:text-[rgb(var(--accent))]"
        >
          ← Retour à l&apos;accueil
        </Link>

        <div className="space-y-10">
          <DashboardHeader displayName={displayName} />
          {scheduleSlots.length > 0 && (
            <CurrentClassBanner slots={scheduleSlots} weekPatternOverride={weekPatternOverride} />
          )}
          <ToHandleSection toHandle={dashboard?.to_handle} loading={dashLoading} suggestions={suggestions} />
          <KpiGrid stats={dashboard?.stats} loading={dashLoading} />
          <QuickActions />
          <ClassesPreview classes={dashboard?.classes_preview} loading={dashLoading} />
          <ActivityTimeline loadActivity={loadActivity} />
        </div>
      </div>

      {showOnboarding && (
        <WelcomeScheduleOnboarding
          firstName={firstName}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}
    </main>
  );
}
