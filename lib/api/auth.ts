import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { ADMIN_EMAILS, SUPER_ADMIN_EMAILS } from "@/lib/admin-config";

type AuthOk = { ok: true; user: User; email: string };
type AuthErr = { ok: false; response: NextResponse };
export type AuthResult = AuthOk | AuthErr;

function err(message: string, status: number): AuthErr {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

export async function requireUser(): Promise<AuthResult> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[requireUser] auth error:", error.message);
    return err("Erreur d'authentification", 500);
  }
  if (!data.user) return err("Non authentifié", 401);
  return { ok: true, user: data.user, email: (data.user.email ?? "").toLowerCase() };
}

export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  if (!(ADMIN_EMAILS as readonly string[]).includes(result.email)) {
    return err("Accès refusé", 403);
  }
  return result;
}

export async function requireSuperAdmin(): Promise<AuthResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  if (!(SUPER_ADMIN_EMAILS as readonly string[]).includes(result.email)) {
    return err("Accès refusé", 403);
  }
  return result;
}

export async function requireTeacher(): Promise<AuthResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  const supabase = createClient();
  const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
  if (isTeacher !== true) return err("Accès refusé", 403);
  return result;
}
