"use client";

import { createClient } from "@/lib/supabase-browser";

type Props = {
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
};

export default function LandingCTA({
  label = "Commencer gratuitement →",
  variant = "primary",
  className = "",
}: Props) {
  const supabase = createClient();

  function handleClick() {
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
      },
    });
  }

  const base = "rounded-2xl px-8 py-4 font-black transition hover:scale-105";
  const styles: Record<string, string> = {
    primary: `${base} bg-purple-600 text-white hover:bg-purple-500`,
    secondary: `${base} border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white`,
  };

  return (
    <button onClick={handleClick} className={`${styles[variant]} ${className}`.trim()}>
      {label}
    </button>
  );
}
