"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type QuestionRow = {
  id: string;
  type: "mcq" | "truefalse";
  question: string;
  subject?: string | null;
  period?: string | null;
  source: "mine" | "public";
};

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default function NewSchoolSessionPage() {
  const supabase = useMemo(() => createClient(), []);

  const [title, setTitle] = useState("Quiz de classe");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [myQuestions, setMyQuestions] = useState<QuestionRow[]>([]);
  const [publicQuestions, setPublicQuestions] = useState<QuestionRow[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [qTab, setQTab] = useState<"mine" | "public">("mine");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [tqRes, qqRes] = await Promise.all([
        user
          ? supabase
              .from("teacher_questions")
              .select("id, type, question, subject")
              .eq("teacher_id", user.id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        supabase
          .from("quiz_questions")
          .select("id, type, question, period")
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      setMyQuestions(
        ((tqRes.data ?? []) as { id: string; type: "mcq" | "truefalse"; question: string; subject: string | null }[]).map(
          (q) => ({ ...q, source: "mine" as const })
        )
      );
      setPublicQuestions(
        ((qqRes.data ?? []) as { id: string; type: "mcq" | "truefalse"; question: string; period: string | null }[]).map(
          (q) => ({ id: q.id, type: q.type, question: q.question, period: q.period, source: "public" as const })
        )
      );
      setQuestionsLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleQuestion(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll(rows: QuestionRow[]) {
    const ids = rows.map((r) => r.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
    }
  }

  async function createSession() {
    if (selectedIds.length === 0) {
      setMessage("Sélectionne au moins une question.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Tu dois être connecté pour créer une session.");
      setLoading(false);
      return;
    }

    const code = makeCode();

    const { data, error } = await supabase
      .from("school_game_sessions")
      .insert({
        code,
        title: title.trim() || "Quiz de classe",
        teacher_id: user.id,
        status: "waiting",
        game_mode: "quiz",
        current_question_index: 0,
        question_ids: selectedIds,
      })
      .select("id")
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Impossible de créer la session.");
      setLoading(false);
      return;
    }

    window.location.href = `/play/session/${data.id}`;
  }

  const activeList = qTab === "mine" ? myQuestions : publicQuestions;
  const filtered = activeList.filter(
    (q) =>
      !filter ||
      q.question.toLowerCase().includes(filter.toLowerCase()) ||
      (q.subject ?? q.period ?? "")
        .toLowerCase()
        .includes(filter.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <a
          href="/school"
          className="text-sm font-bold text-gray-500 transition hover:text-amber-400"
        >
          ← Espace professeur
        </a>

        <div className="mt-4 rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-2xl shadow-black/40">
          <p className="text-sm font-bold uppercase tracking-widest text-amber-400">
            Espace professeur
          </p>

          <h1 className="mt-3 text-4xl font-black">Créer une session</h1>

          <p className="mt-2 text-gray-400">
            Choisis un titre et sélectionne tes questions.
          </p>

          {/* Title */}
          <div className="mt-6">
            <label className="text-sm font-bold text-gray-300">
              Titre de la session
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-amber-500"
              placeholder="Ex : Révolution française"
            />
          </div>

          {/* Question selection */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-300">
                Questions
              </label>
              {selectedIds.length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-300">
                  {selectedIds.length} sélectionnée(s)
                </span>
              )}
            </div>

            {/* Sub-tabs */}
            <div className="mt-3 flex gap-1 border-b border-gray-800">
              <button
                onClick={() => setQTab("mine")}
                className={`rounded-t-xl px-4 py-2 text-xs font-black transition ${
                  qTab === "mine"
                    ? "bg-gray-950 text-amber-400"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                Mes questions ({myQuestions.length})
              </button>
              <button
                onClick={() => setQTab("public")}
                className={`rounded-t-xl px-4 py-2 text-xs font-black transition ${
                  qTab === "public"
                    ? "bg-gray-950 text-amber-400"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                HistoGuess ({publicQuestions.length})
              </button>
            </div>

            <div className="rounded-b-2xl rounded-tr-2xl border border-gray-800 bg-gray-950 p-3">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrer..."
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-amber-500"
              />

              {questionsLoading ? (
                <p className="mt-4 text-center text-sm text-gray-500">
                  Chargement...
                </p>
              ) : filtered.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">
                  {qTab === "mine" ? (
                    <>
                      Aucune question.{" "}
                      <a
                        href="/school/questions"
                        className="font-bold text-amber-400 underline"
                      >
                        Crée-en depuis Mes questions
                      </a>
                      .
                    </>
                  ) : (
                    "Aucun résultat."
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <button
                    onClick={() => toggleAll(filtered)}
                    className="mb-2 text-xs font-bold text-gray-500 hover:text-amber-400 transition"
                  >
                    {filtered.every((q) => selectedIds.includes(q.id))
                      ? "Tout désélectionner"
                      : "Tout sélectionner"}
                  </button>

                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {filtered.map((q) => {
                      const selected = selectedIds.includes(q.id);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => toggleQuestion(q.id)}
                          className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                            selected
                              ? "bg-amber-500/15 border border-amber-500/30"
                              : "border border-transparent hover:bg-gray-800"
                          }`}
                        >
                          <span
                            className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 transition ${
                              selected
                                ? "border-amber-500 bg-amber-500"
                                : "border-gray-600"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-xs font-black ${
                                  q.type === "mcq"
                                    ? "bg-blue-500/20 text-blue-300"
                                    : "bg-purple-500/20 text-purple-300"
                                }`}
                              >
                                {q.type === "mcq" ? "QCM" : "V/F"}
                              </span>
                              {(q.subject ?? q.period) && (
                                <span className="text-xs text-gray-500">
                                  {q.subject ?? q.period}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-sm font-bold text-white">
                              {q.question}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Errors */}
          {message && (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-300">
              {message}
            </div>
          )}

          {/* Create button */}
          <button
            type="button"
            onClick={createSession}
            disabled={loading || selectedIds.length === 0}
            className="mt-6 w-full rounded-2xl bg-amber-500 px-5 py-4 font-black text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Création..."
              : selectedIds.length === 0
              ? "Sélectionne des questions"
              : `Créer la session (${selectedIds.length} question${selectedIds.length > 1 ? "s" : ""})`}
          </button>

          <a
            href="/join"
            className="mt-3 block text-center text-sm font-bold text-gray-500 transition hover:text-amber-400"
          >
            Rejoindre une session élève
          </a>
        </div>
      </div>
    </main>
  );
}
