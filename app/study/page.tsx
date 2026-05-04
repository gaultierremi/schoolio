import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import Header from "@/components/Header";
import StudyWizard from "@/components/StudyWizard";

export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <Header />
      <div className="flex-1">
        <div className="mx-auto w-full max-w-xl px-4 pt-6 text-center">
          <span className="mb-4 inline-block rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-purple-400">
            Étudier
          </span>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
            Créer mon quiz
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Choisis ta source, configure ta session et entraîne-toi.
          </p>
        </div>
        <StudyWizard />
      </div>
    </main>
  );
}
