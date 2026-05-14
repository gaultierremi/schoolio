"use client";

import { useState } from "react";

export function ClearCacheButton() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleClear() {
    if (!confirm("Vider tout le cache Maïa ? Les prochaines requêtes identiques repasseront par les providers.")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/ai-router/cache", { method: "DELETE" });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClear}
      disabled={loading}
      className="rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {loading ? "Suppression…" : done ? "✓ Cache vidé" : "Vider le cache"}
    </button>
  );
}
