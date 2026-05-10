import { SupabaseClient } from "@supabase/supabase-js";

export type RandomPickCandidate = {
  student_user_id: string;
  student_name: string;
  pick_count_30d: number;
  weight: number;
};

export async function getRandomPickCandidates(
  admin: SupabaseClient,
  classId: string,
): Promise<RandomPickCandidate[]> {
  const { data: memberships, error: membError } = await admin
    .from("class_memberships")
    .select("student_user_id, user_profiles!inner(first_name, last_name)")
    .eq("class_id", classId)
    .eq("status", "active");

  if (membError || !memberships?.length) return [];

  const allMembers = memberships.map((m) => {
    const profile = (m.user_profiles as unknown) as { first_name: string | null; last_name: string | null } | null;
    return {
      student_user_id: m.student_user_id as string,
      student_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Élève",
    };
  });

  // Filter by today's attendance; if no record → all present
  const today = new Date().toISOString().slice(0, 10);
  const { data: attendanceRecords } = await admin
    .from("class_attendance_records")
    .select("student_user_id, status")
    .eq("class_id", classId)
    .eq("date", today);

  let presentIds: Set<string>;
  if (!attendanceRecords || attendanceRecords.length === 0) {
    presentIds = new Set(allMembers.map((m) => m.student_user_id));
  } else {
    presentIds = new Set(
      attendanceRecords
        .filter((r) => r.status === "present" || r.status === "late")
        .map((r) => r.student_user_id as string),
    );
  }

  const candidates = allMembers.filter((m) => presentIds.has(m.student_user_id));
  if (!candidates.length) return [];

  // Pick counts over last 30 days (non-cancelled)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: picks } = await admin
    .from("student_random_picks")
    .select("student_user_id")
    .eq("class_id", classId)
    .in("student_user_id", candidates.map((c) => c.student_user_id))
    .eq("was_cancelled", false)
    .gte("picked_at", thirtyDaysAgo);

  const countMap: Record<string, number> = {};
  for (const p of picks ?? []) {
    countMap[p.student_user_id as string] = (countMap[p.student_user_id as string] ?? 0) + 1;
  }

  const withCounts = candidates.map((c) => ({
    ...c,
    pick_count_30d: countMap[c.student_user_id] ?? 0,
  }));

  const maxCount = Math.max(...withCounts.map((c) => c.pick_count_30d), 0);
  return withCounts.map((c) => ({
    ...c,
    weight: maxCount + 1 - c.pick_count_30d,
  }));
}

export function selectWeightedRandom(candidates: RandomPickCandidate[]): RandomPickCandidate {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let rand = Math.random() * total;
  for (const c of candidates) {
    rand -= c.weight;
    if (rand <= 0) return c;
  }
  return candidates[candidates.length - 1];
}
