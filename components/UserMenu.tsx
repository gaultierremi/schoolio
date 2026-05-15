"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";
import Avatar from "@/components/Avatar";
import { ChevronDown, LogOut, Monitor, Moon, Sun, UserCircle } from "lucide-react";

/**
 * Menu utilisateur dropdown en top-right du Header (Sprint 1.5).
 *
 * UX :
 * - Avatar cliquable → ouvre dropdown
 * - Dropdown : nom + email du user + lien "Mon compte" + bouton déconnexion
 * - Pas de page profil dédiée côté élève (mémoire `feedback_no_student_profile_route`)
 * - "Mon compte" mène à `/parametres/compte` (créée séparément), pas un modal
 *
 * Conforme design-system MASTER §Composants + Lucide-only.
 */
type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: { value: ThemeOption; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Clair", Icon: Sun },
  { value: "dark", label: "Sombre", Icon: Moon },
  { value: "system", label: "Système", Icon: Monitor },
];

export default function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes anti-hydration : ne pas render le toggle tant qu'on n'est pas
  // mounted côté client (sinon mismatch SSR / CSR sur la classe `.dark`)
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/";
  }

  if (!user) {
    return null; // Header switches to a "Sign in" affordance when unauthenticated
  }

  const photoUrl = user.user_metadata?.avatar_url as string | undefined;
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.firstName as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-1 py-1 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
      >
        <Avatar photoUrl={photoUrl} name={displayName} size={28} />
        <span className="hidden max-w-[140px] truncate pr-1 text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">
          {displayName}
        </span>
        <ChevronDown
          size={14}
          className={`hidden text-slate-400 transition-transform sm:block ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {displayName || "Utilisateur"}
            </p>
            {user.email && (
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {user.email}
              </p>
            )}
          </div>

          <Link
            href="/accueil/parametres/compte"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <UserCircle size={16} strokeWidth={1.75} className="text-slate-500" />
            Mon compte
          </Link>

          {mounted && (
            <div className="my-1 border-t border-slate-100 pt-1 dark:border-slate-800">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Apparence
              </p>
              <div className="grid grid-cols-3 gap-1 px-2 pb-1">
                {THEME_OPTIONS.map((opt) => {
                  const active = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => setTheme(opt.value)}
                      title={opt.label}
                      className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium transition ${
                        active
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      <opt.Icon size={14} strokeWidth={active ? 2 : 1.75} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 pt-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut size={16} strokeWidth={1.75} className="text-slate-500" />
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
      )}
    </div>
  );
}
