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
        <GraduationCap className="h-8 w-8 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
        <div>
          <h1 className="serif text-3xl font-black text-[rgb(var(--ink))]">Espace enseignant</h1>
          {displayName && (
            <p className="mt-0.5 text-sm text-[rgb(var(--ink-3))]">
              {getGreeting()}, {displayName}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
