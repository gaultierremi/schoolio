import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import JoinClassForm from "./JoinClassForm";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /join est auth-required (middleware gère le redirect vers /login si non auth).
  // Cette vérif est défense en profondeur si le middleware est bypassé.
  if (!user) {
    const code = searchParams.code?.trim().toUpperCase() ?? "";
    redirect(`/login?next=${encodeURIComponent(`/join${code ? `?code=${code}` : ""}`)}`);
  }

  const code = searchParams.code?.trim().toUpperCase() ?? "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[rgb(var(--surface-2))] px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="serif text-3xl font-bold text-[rgb(var(--ink))]">
            Rejoindre une classe
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
            Entre le code donné par ton professeur
          </p>
        </div>

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
          <p className="mb-4 text-center text-xs text-[rgb(var(--ink-3))]">
            Connecté : <span className="text-[rgb(var(--ink-2))]">{user.email}</span>
          </p>
          <JoinClassForm initialCode={code} />
        </div>

        <p className="text-center text-xs text-[rgb(var(--ink-3))]">
          <Link href="/accueil" className="hover:text-[rgb(var(--ink-2))]">
            ← Retour à mon espace
          </Link>
        </p>
      </div>
    </main>
  );
}
