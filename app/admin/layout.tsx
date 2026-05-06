import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

const ADMIN_EMAILS = [
  "presti013@gmail.com",
  "gaultierremi@gmail.com",
  "kenzaboulet26@gmail.com",
  "christophe.lecrenier@gmail.com",
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    redirect("/");
  }

  return <>{children}</>;
}
