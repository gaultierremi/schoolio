import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { ADMIN_EMAILS } from "@/lib/admin-config";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(ADMIN_EMAILS as readonly string[]).includes(user.email?.toLowerCase() ?? "")) {
    redirect("/");
  }

  return <>{children}</>;
}
