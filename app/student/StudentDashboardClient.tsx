"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

type ClassEntry = {
  classId: string;
  className: string;
  level: string | null;
  subject: string | null;
  teacherName: string;
  joinedAt: string;
};

type Props = {
  displayName: string;
  classes: ClassEntry[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function subjectMeta(subject: string | null) {
  if (!subject) return null;
  return SUBJECTS_BY_ID[subject as SubjectId] ?? null;
}

function ClassCard({
  entry,
  onLeave,
  leaving,
}: {
  entry: ClassEntry;
  onLeave: (classId: string) => void;
  leaving: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const subj = subjectMeta(entry.subject);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div>
          <p className="font-black text-white">{entry.className}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Prof : {entry.teacherName}
            {subj && (
              <>
                {" "}
                · {subj.emoji} {subj.label}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Rejoint le {formatDate(entry.joinedAt)}
          </p>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={leaving}
            className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-500 transition hover:border-red-700/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quitter
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
            <h2 className="text-lg font-black text-white">
              Quitter cette classe ?
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Tu seras retiré de{" "}
              <span className="font-bold text-white">{entry.className}</span>.
              Tu peux la rejoindre à nouveau avec le code.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-gray-700 py-2.5 text-sm font-bold text-gray-300 transition hover:border-gray-600 hover:text-white"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  onLeave(entry.classId);
                }}
                className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-500"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function StudentDashboardClient({
  displayName,
  classes: initialClasses,
}: Props) {
  const router = useRouter();
  const [classes, setClasses] = useState(initialClasses);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleLeave(classId: string) {
    setLeavingId(classId);
    const res = await fetch(`/api/student/classes/${classId}/leave`, {
      method: "POST",
    });
    if (res.ok) {
      setClasses((prev) => prev.filter((c) => c.classId !== classId));
    }
    setLeavingId(null);
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white">
              🎒 Bonjour, {displayName} !
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Espace élève · {classes.length} classe
              {classes.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="shrink-0 rounded-2xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-400 transition hover:border-gray-600 hover:text-white disabled:opacity-50"
          >
            {signingOut ? "..." : "Se déconnecter"}
          </button>
        </div>

        {/* Join another class */}
        <div className="mt-6">
          <a
            href="/join"
            className="inline-block rounded-2xl bg-purple-500 px-5 py-2.5 font-black text-gray-950 transition hover:bg-purple-400"
          >
            + Rejoindre une autre classe
          </a>
        </div>

        {/* Classes */}
        <div className="mt-8">
          {classes.length === 0 ? (
            <div className="mt-8 text-center">
              <p className="text-4xl">🏫</p>
              <p className="mt-4 text-lg font-black text-white">
                Tu n&apos;es inscrit dans aucune classe
              </p>
              <a
                href="/join"
                className="mt-4 inline-block rounded-2xl bg-purple-500 px-6 py-2.5 font-black text-gray-950 transition hover:bg-purple-400"
              >
                Rejoindre une classe
              </a>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {classes.map((entry) => (
                <ClassCard
                  key={entry.classId}
                  entry={entry}
                  onLeave={handleLeave}
                  leaving={leavingId === entry.classId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
