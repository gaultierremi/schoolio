import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/api/auth";
import { addFounderTeacher } from "@/lib/founders";
import { apiError, apiOk, safeError } from "@/lib/api/respond";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as { email?: unknown; notes?: unknown };

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim().slice(0, 200)
        : undefined;

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return apiError("Email invalide", 400);
    }

    await addFounderTeacher(email, auth.user.id, notes);
    return apiOk({ email });
  } catch (err) {
    return safeError(err, "admin:founders:add");
  }
}
