import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/api/auth";
import { removeFounderTeacher } from "@/lib/founders";
import { apiError, apiOk, safeError } from "@/lib/api/respond";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { email: string } }
) {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return auth.response;

    const email = decodeURIComponent(params.email).trim().toLowerCase();
    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return apiError("Email invalide", 400);
    }

    await removeFounderTeacher(email);
    return apiOk({ email });
  } catch (err) {
    return safeError(err, "admin:founders:remove");
  }
}
