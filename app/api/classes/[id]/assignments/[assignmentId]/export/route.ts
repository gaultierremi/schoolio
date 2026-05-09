import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  pseudo: string | null;
  auth_mode: string | null;
  user_name: string | null;
};

type CompletionRow = {
  student_user_id: string;
  status: string;
  score: number | null;
  duration_seconds: number | null;
  attempts_count: number;
  completed_at: string | null;
};

function extractNames(p: ProfileRow): { firstName: string; lastName: string } {
  if (p.first_name !== null) return { firstName: p.first_name, lastName: p.last_name ?? "" };
  const parts = (p.user_name ?? "").split(" ");
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function csvField(value: string): string {
  if (/[,"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtDateFR(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()} ${h}:${min}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "À faire",
  in_progress: "En cours",
  completed: "Fait",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true)
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: assignment } = await admin
      .from("assignments")
      .select("id, title, resource_type")
      .eq("id", params.assignmentId)
      .eq("class_id", params.id)
      .eq("assigned_by", user.id)
      .maybeSingle();

    if (!assignment)
      return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });

    const [membersRes, completionsRes] = await Promise.all([
      admin
        .from("class_memberships")
        .select("student_user_id")
        .eq("class_id", params.id)
        .eq("status", "active"),
      admin
        .from("assignment_completions")
        .select("student_user_id, status, score, duration_seconds, attempts_count, completed_at")
        .eq("assignment_id", params.assignmentId),
    ]);

    const members = membersRes.data ?? [];
    const studentIds = members.map((m) => m.student_user_id);

    const profilesRes =
      studentIds.length > 0
        ? await admin
            .from("user_profiles")
            .select("id, first_name, last_name, pseudo, auth_mode, user_name")
            .in("id", studentIds)
        : { data: [] as ProfileRow[] };

    const profileMap = new Map<string, ProfileRow>(
      (profilesRes.data ?? []).map((p) => [p.id, p as ProfileRow])
    );
    const completionMap = new Map<string, CompletionRow>(
      (completionsRes.data ?? []).map((c) => [c.student_user_id, c as CompletionRow])
    );

    const rows = members
      .map((m) => {
        const p = profileMap.get(m.student_user_id);
        const c = completionMap.get(m.student_user_id);
        const { firstName, lastName } = p ? extractNames(p) : { firstName: "", lastName: "" };
        const pseudo = p?.pseudo ?? "";
        const status = c?.status ?? "pending";
        const done = c !== undefined && status === "completed";
        return {
          firstName,
          lastName,
          pseudo,
          status: STATUS_LABEL[status] ?? status,
          score: done && c.score !== null ? String(Math.round(Number(c.score))) : "",
          attempts: done && c.attempts_count ? String(c.attempts_count) : "",
          duration: done ? fmtDuration(c.duration_seconds) : "",
          completedAt: done ? fmtDateFR(c.completed_at) : "",
          _sortLast: lastName.toLowerCase(),
          _sortFirst: firstName.toLowerCase(),
        };
      })
      .sort((a, b) => {
        const lc = a._sortLast.localeCompare(b._sortLast, "fr", { sensitivity: "base" });
        if (lc !== 0) return lc;
        return a._sortFirst.localeCompare(b._sortFirst, "fr", { sensitivity: "base" });
      });

    const lines = [
      csvRow(["Prénom", "Nom", "Pseudo", "Statut", "Score (%)", "Tentatives", "Temps (mm:ss)", "Date complétion"]),
      ...rows.map((r) =>
        csvRow([r.firstName, r.lastName, r.pseudo, r.status, r.score, r.attempts, r.duration, r.completedAt])
      ),
    ];

    const csv = "﻿" + lines.join("\r\n");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `devoir-${slugify(assignment.title)}-${date}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[assignment/export:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
