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
  assignment_id: string;
  student_user_id: string;
  status: string;
  score: number | null;
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

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
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

    const { data: cls } = await admin
      .from("classes")
      .select("id, name")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!cls)
      return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const [membersRes, assignmentsRes] = await Promise.all([
      admin
        .from("class_memberships")
        .select("student_user_id")
        .eq("class_id", params.id)
        .eq("status", "active"),
      admin
        .from("assignments")
        .select("id, title, resource_type")
        .eq("class_id", params.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
    ]);

    const members = membersRes.data ?? [];
    const assignments = (assignmentsRes.data ?? []) as { id: string; title: string; resource_type: string }[];
    const studentIds = members.map((m) => m.student_user_id);
    const assignmentIds = assignments.map((a) => a.id);

    const [profilesRes, completionsRes] = await Promise.all([
      studentIds.length > 0
        ? admin
            .from("user_profiles")
            .select("id, first_name, last_name, pseudo, auth_mode, user_name")
            .in("id", studentIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
      assignmentIds.length > 0 && studentIds.length > 0
        ? admin
            .from("assignment_completions")
            .select("assignment_id, student_user_id, status, score")
            .in("assignment_id", assignmentIds)
            .in("student_user_id", studentIds)
        : Promise.resolve({ data: [] as CompletionRow[] }),
    ]);

    const profileMap = new Map<string, ProfileRow>(
      (profilesRes.data ?? []).map((p) => [p.id, p as ProfileRow])
    );

    // completionMap[studentId][assignmentId]
    const completionMap = new Map<string, Map<string, { status: string; score: number | null }>>();
    for (const c of (completionsRes.data ?? []) as CompletionRow[]) {
      if (!completionMap.has(c.student_user_id)) completionMap.set(c.student_user_id, new Map());
      completionMap.get(c.student_user_id)!.set(c.assignment_id, { status: c.status, score: c.score });
    }

    const sortedStudents = [...members].sort((a, b) => {
      const pa = profileMap.get(a.student_user_id);
      const pb = profileMap.get(b.student_user_id);
      const { lastName: lastA, firstName: firstA } = pa ? extractNames(pa) : { lastName: "", firstName: "" };
      const { lastName: lastB, firstName: firstB } = pb ? extractNames(pb) : { lastName: "", firstName: "" };
      const lc = lastA.localeCompare(lastB, "fr", { sensitivity: "base" });
      if (lc !== 0) return lc;
      return firstA.localeCompare(firstB, "fr", { sensitivity: "base" });
    });

    const assignmentHeaders = assignments.map(
      (a) => `${a.title} (${a.resource_type === "quiz" ? "quiz" : "lu"})`
    );
    const headers = ["Prénom", "Nom", "Pseudo", ...assignmentHeaders];

    const rows = sortedStudents.map((m) => {
      const p = profileMap.get(m.student_user_id);
      const { firstName, lastName } = p ? extractNames(p) : { firstName: "", lastName: "" };
      const pseudo = p?.pseudo ?? "";

      const assignmentValues = assignments.map((a) => {
        const c = completionMap.get(m.student_user_id)?.get(a.id);
        if (!c || c.status !== "completed") return "—";
        if (a.resource_type === "quiz")
          return c.score !== null ? String(Math.round(Number(c.score))) : "—";
        return "Lu";
      });

      return [firstName, lastName, pseudo, ...assignmentValues];
    });

    const lines = [csvRow(headers), ...rows.map((r) => csvRow(r))];
    const csv = "﻿" + lines.join("\r\n");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `classe-${slugify(cls.name)}-${date}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[class/export:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
