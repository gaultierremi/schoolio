"use client";

import { GraduationCap } from "lucide-react";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function DashboardHeader({ displayName }: { displayName?: string }) {
  return (
    <header>
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"
        >
          <GraduationCap size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Espace enseignant
          </h1>
          {displayName && (
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              {getGreeting()}, {displayName}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
