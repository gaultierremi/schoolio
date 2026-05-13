import { createClient } from "@supabase/supabase-js";

export type FounderTeacher = {
  email: string;
  added_by: string | null;
  added_at: string;
  notes: string | null;
};

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function isFounderTeacher(email: string): Promise<boolean> {
  const { data } = await admin()
    .from("founder_teachers")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return data !== null;
}

export async function listFounderTeachers(): Promise<FounderTeacher[]> {
  const { data, error } = await admin()
    .from("founder_teachers")
    .select("email, added_by, added_at, notes")
    .order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FounderTeacher[];
}

export async function addFounderTeacher(
  email: string,
  addedBy: string,
  notes?: string
): Promise<void> {
  const lower = email.trim().toLowerCase();
  const { error } = await admin()
    .from("founder_teachers")
    .insert({ email: lower, added_by: addedBy, notes: notes ?? null });
  if (error) throw error;
}

export async function removeFounderTeacher(email: string): Promise<void> {
  const lower = email.trim().toLowerCase();
  const { error } = await admin()
    .from("founder_teachers")
    .delete()
    .eq("email", lower);
  if (error) throw error;
}
