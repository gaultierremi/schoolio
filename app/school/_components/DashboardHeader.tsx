"use client";

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
        <span className="text-3xl">🎓</span>
        <div>
          <h1 className="text-3xl font-black text-white">Espace enseignant</h1>
          {displayName && (
            <p className="mt-0.5 text-sm text-gray-500">
              {getGreeting()}, {displayName}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
