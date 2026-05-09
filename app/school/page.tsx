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

type DashboardData = {
  stats: Stats;
  to_handle: ToHandle;
  classes_preview: ClassPreview[];
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonPage() {
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="h-5 w-32 animate-pulse rounded-lg bg-gray-800" />
        <div className="h-10 w-64 animate-pulse rounded-lg bg-gray-800" />
        <div className="h-10 animate-pulse rounded-xl bg-gray-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-800" />
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
      const res = await fetch("/api/school/dashboard-summary");
      if (res.ok) setDashboard((await res.json()) as DashboardData);
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
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-black text-red-300">Accès refusé</h1>
          <p className="mt-2 text-gray-300">
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

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/"
          className="mb-6 inline-block text-sm font-bold text-gray-500 transition-colors hover:text-purple-400"
        >
          ← Retour à l&apos;accueil
        </Link>

        <div className="space-y-10">
          <DashboardHeader displayName={displayName} />
          <ToHandleSection toHandle={dashboard?.to_handle} loading={dashLoading} />
          <KpiGrid stats={dashboard?.stats} loading={dashLoading} />
          <QuickActions />
          <ClassesPreview classes={dashboard?.classes_preview} loading={dashLoading} />
          <ActivityTimeline loadActivity={loadActivity} />
        </div>
      </div>
    </main>
  );
}
