"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    router.push("/");
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="shrink-0 rounded-2xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))] disabled:opacity-50"
    >
      {loading ? "..." : "Se déconnecter"}
    </button>
  );
}
