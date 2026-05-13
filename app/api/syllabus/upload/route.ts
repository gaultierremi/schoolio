import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel function timeout; uploads are fast but safety net

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 MB
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  try {
    // Rule 4: auth check is the FIRST instruction
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    const form = await req.formData();
    const pdf = form.get("pdf");
    const programId = form.get("programId");

    if (!(pdf instanceof File)) return apiError("PDF manquant", 400);
    // Rule 7: validate every field with correct types and patterns
    if (typeof programId !== "string" || !UUID_RE.test(programId)) {
      return apiError("programId invalide", 400);
    }
    if (pdf.type !== "application/pdf") {
      return apiError("Type de fichier invalide (PDF requis)", 415);
    }
    if (pdf.size === 0) return apiError("Fichier vide", 400);
    if (pdf.size > MAX_PDF_SIZE) return apiError("Fichier trop volumineux (50 MB max)", 413);

    const buf = Buffer.from(await pdf.arrayBuffer());
    const sha256 = createHash("sha256").update(buf).digest("hex");

    // Sanitize filename: ASCII alphanumerics, dot, underscore, dash; cap to 100 chars
    const safeName = pdf.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const storagePath = `${schoolId}/${programId}/${sha256.slice(0, 16)}-${safeName}`;

    // Rule 8: use session-aware client for storage writes so RLS enforces school_id prefix
    const { error: upErr } = await supabase.storage.from("syllabi").upload(storagePath, buf, {
      contentType: "application/pdf",
      upsert: false,
    });

    // 409 from storage means the same file (sha-prefixed path) was already uploaded.
    // That's idempotent for our purposes — return the existing path.
    if (upErr && !/(already exists|Duplicate)/i.test(upErr.message)) {
      return apiError(upErr.message, 500);
    }

    return apiOk({ path: storagePath, sha256, size: pdf.size });
  } catch (err) {
    await logError(err, {
      source: "api.syllabus.upload.POST",
      context: { route: "/api/syllabus/upload" },
    });
    return safeError(err, "syllabus:upload");
  }
}
