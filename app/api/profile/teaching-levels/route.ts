import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { currentAcademicYear } from "@/lib/dates";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/profile/teaching-levels?academic_year=YYYY/YYYY (default = current)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    const ay = req.nextUrl.searchParams.get("academic_year") ?? currentAcademicYear();
    if (!/^\d{4}\/\d{4}$/.test(ay)) {
      return apiError("academic_year invalide", 400);
    }

    const { data } = await admin()
      .from("teacher_teaching_years")
      .select("taught_levels, academic_year, updated_at")
      .eq("teacher_id", auth.user.id)
      .eq("academic_year", ay)
      .maybeSingle();

    return apiOk({
      academic_year: ay,
      taught_levels: (data?.taught_levels as number[] | null) ?? null,
      onboarded: !!data,
    });
  } catch (err) {
    await logError(err, { source: "api.profile.teaching-levels.GET" });
    return safeError(err, "profile:teaching-levels:get");
  }
}

// POST /api/profile/teaching-levels  body: { taught_levels: number[] }
export async function POST(req: NextRequest) {
  try {
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    const body = (await req.json()) as { taught_levels?: unknown };

    if (!Array.isArray(body.taught_levels) || body.taught_levels.length === 0) {
      return apiError("Sélectionne au moins un niveau", 400);
    }
    if (body.taught_levels.length > 6) {
      return apiError("Max 6 niveaux", 400);
    }
    const levels: number[] = [];
    for (const l of body.taught_levels) {
      if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > 6) {
        return apiError("Niveaux doivent être entre 1 et 6", 400);
      }
      if (!levels.includes(l)) levels.push(l);
    }
    levels.sort((a, b) => a - b);

    const ay = currentAcademicYear();

    const { data, error } = await admin()
      .from("teacher_teaching_years")
      .upsert(
        {
          teacher_id: auth.user.id,
          school_id: schoolId,
          academic_year: ay,
          taught_levels: levels,
        },
        { onConflict: "teacher_id,academic_year" },
      )
      .select("academic_year, taught_levels")
      .single();

    if (error) {
      await logError(error, { source: "api.profile.teaching-levels.POST", userId: auth.user.id });
      return apiError("Sauvegarde échouée", 500);
    }

    return apiOk({ academic_year: data.academic_year, taught_levels: data.taught_levels });
  } catch (err) {
    await logError(err, { source: "api.profile.teaching-levels.POST" });
    return safeError(err, "profile:teaching-levels:post");
  }
}
