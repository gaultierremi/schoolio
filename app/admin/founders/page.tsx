import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";
import { listFounderTeachers } from "@/lib/founders";
import FoundersClient from "./FoundersClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Founders · Admin · Maïa",
};

export default async function FoundersAdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (
    !user.email ||
    !(SUPER_ADMIN_EMAILS as readonly string[]).includes(user.email.toLowerCase())
  ) {
    redirect("/");
  }

  const founders = await listFounderTeachers();

  return <FoundersClient initialFounders={founders} currentUserId={user.id} />;
}
