"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function SchoolDashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const { data, error } = await supabase.rpc(
        "is_current_user_school_teacher"
      );

      setIsTeacher(data === true && !error);
      setLoading(false);
    }

    checkAccess();
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 p-8 text-white">
        Chargement...
      </main>
    );
  }

  if (!isTeacher) {
    return (
      <main className="min-h-screen bg-gray-950 p-8 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-black text-red-300">Accès refusé</h1>
          <p className="mt-2 text-gray-300">
            Cet espace est réservé aux professeurs autorisés.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-widest text-amber-400">
          Espace professeur
        </p>

        <h1 className="mt-2 text-4xl font-black">School</h1>

        <p className="mt-2 text-gray-400">
          Gère tes quiz, crée des sessions de classe et prépare tes questions.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <a
            href="/school/session/new"
            className="rounded-3xl border border-gray-800 bg-gray-900 p-6 transition hover:border-amber-500/50 hover:bg-gray-800"
          >
            <div className="text-4xl">🚀</div>
            <h2 className="mt-4 text-xl font-black">Créer une session</h2>
            <p className="mt-2 text-sm text-gray-400">
              Lance un quiz live que les élèves rejoignent avec un code.
            </p>
          </a>

          <a
            href="/school/questions"
            className="rounded-3xl border border-gray-800 bg-gray-900 p-6 transition hover:border-amber-500/50 hover:bg-gray-800"
          >
            <div className="text-4xl">📚</div>
            <h2 className="mt-4 text-xl font-black">Mes questions</h2>
            <p className="mt-2 text-sm text-gray-400">
              Crée, importe depuis un PDF et gère tes questions de quiz.
            </p>
          </a>

          <div className="rounded-3xl border border-gray-800 bg-gray-900 p-6 opacity-70">
            <div className="text-4xl">📄</div>
            <h2 className="mt-4 text-xl font-black">Importer un PDF</h2>
            <p className="mt-2 text-sm text-gray-400">
              Bientôt : générer automatiquement des questions depuis un cours.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}