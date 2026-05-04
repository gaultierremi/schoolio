import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import Header from "@/components/Header";
import ReviewCard from "@/components/ReviewCard";
import { getDueQuestions } from "@/lib/recommendations";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StudyReviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  let questions: Awaited<ReturnType<typeof getDueQuestions>> = [];
  try {
    questions = await getDueQuestions(user.id);
  } catch {}

  if (questions.length === 0) {
    return (
      <main className="flex min-h-screen flex-col bg-gray-950">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-12 text-center">
          <p className="text-5xl">✅</p>
          <div>
            <p className="text-xl font-black text-white">
              Tout est à jour !
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Aucune question n&apos;est due pour révision aujourd&apos;hui.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/study"
              className="rounded-xl border border-gray-700 px-5 py-3 text-sm font-bold text-gray-400 transition hover:text-white"
            >
              ← Créer une session
            </Link>
            <Link
              href="/study/stats"
              className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-purple-500"
            >
              Voir mes progrès
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <Header />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4">
        <div className="pt-4 text-center">
          <span className="inline-block rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-purple-400">
            Révision espacée
          </span>
          <p className="mt-2 text-sm text-gray-500">
            {questions.length} question{questions.length > 1 ? "s" : ""} due
            {questions.length > 1 ? "s" : ""} aujourd&apos;hui
          </p>
        </div>
        <ReviewCard questions={questions} />
      </div>
    </main>
  );
}
