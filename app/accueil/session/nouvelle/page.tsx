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

    const res = await fetch("/api/live/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || "Quiz de classe",
        question_ids: selectedIds,
      }),
    });

    const json = (await res.json()) as { session?: { id: string }; error?: string };
    if (!res.ok || !json.session) {
      setMessage(json.error ?? "Impossible de créer la session.");
      setLoading(false);
      return;
    }

    window.location.href = `/accueil/live/${json.session.id}`;
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
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-10 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-2xl">
        <a
          href="/accueil"
          className="text-sm font-bold text-[rgb(var(--ink-3))] transition hover:text-[rgb(var(--accent))]"
        >
          ← Espace professeur
        </a>

        <div className="mt-4 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-lg">
          <p className="text-sm font-bold uppercase tracking-widest text-[rgb(var(--accent))]">
            Espace professeur
          </p>

          <h1 className="serif mt-3 text-4xl font-black text-[rgb(var(--ink))]">Créer une session</h1>

          <p className="mt-2 text-[rgb(var(--ink-2))]">
            Choisis un titre et sélectionne tes questions.
          </p>

          {/* Title */}
          <div className="mt-6">
            <label className="text-sm font-bold text-[rgb(var(--ink))]">
              Titre de la session
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
              placeholder="Ex : Révolution française"
            />
          </div>

          {/* Question selection */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[rgb(var(--ink))]">
                Questions
              </label>
              {selectedIds.length > 0 && (
                <span className="rounded-full bg-[rgb(var(--accent))]/15 px-3 py-1 text-xs font-black text-[rgb(var(--accent))]">
                  {selectedIds.length} sélectionnée(s)
                </span>
              )}
            </div>

            {/* Sub-tabs */}
            <div className="mt-3 flex gap-1 border-b border-[rgb(var(--border))]">
              <button
                onClick={() => setQTab("mine")}
                className={`rounded-t-xl px-4 py-2 text-xs font-black transition ${
                  qTab === "mine"
                    ? "border-b-2 border-[rgb(var(--accent))] bg-[rgb(var(--surface-2))] text-[rgb(var(--accent))]"
                    : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
                }`}
              >
                Mes questions ({myQuestions.length})
              </button>
              <button
                onClick={() => setQTab("public")}
                className={`rounded-t-xl px-4 py-2 text-xs font-black transition ${
                  qTab === "public"
                    ? "border-b-2 border-[rgb(var(--accent))] bg-[rgb(var(--surface-2))] text-[rgb(var(--accent))]"
                    : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
                }`}
              >
                HistoGuess ({publicQuestions.length})
              </button>
            </div>

            <div className="rounded-b-2xl rounded-tr-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrer..."
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
              />

              {questionsLoading ? (
                <p className="mt-4 text-center text-sm text-[rgb(var(--ink-3))]">
                  Chargement...
                </p>
              ) : filtered.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-[rgb(var(--border))] p-6 text-center text-sm text-[rgb(var(--ink-3))]">
                  {qTab === "mine" ? (
                    <>
                      Aucune question.{" "}
                      <a
                        href="/accueil/curation"
                        className="font-bold text-[rgb(var(--accent))] underline"
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
                    className="mb-2 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:text-[rgb(var(--accent))]"
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
                              ? "border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/10"
                              : "border border-transparent hover:bg-[rgb(var(--surface-3))]"
                          }`}
                        >
                          <span
                            className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 transition ${
                              selected
                                ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]"
                                : "border-[rgb(var(--border))]"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-xs font-black ${
                                  q.type === "mcq"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-purple-100 text-purple-700"
                                }`}
                              >
                                {q.type === "mcq" ? "QCM" : "V/F"}
                              </span>
                              {(q.subject ?? q.period) && (
                                <span className="text-xs text-[rgb(var(--ink-3))]">
                                  {q.subject ?? q.period}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-sm font-bold text-[rgb(var(--ink))]">
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
            <div className="mt-4 rounded-2xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/10 p-3 text-sm font-bold text-[rgb(var(--accent))]">
              {message}
            </div>
          )}

          {/* Create button */}
          <button
            type="button"
            onClick={createSession}
            disabled={loading || selectedIds.length === 0}
            className="mt-6 w-full rounded-2xl bg-[rgb(var(--accent))] px-5 py-4 font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Création..."
              : selectedIds.length === 0
              ? "Sélectionne des questions"
              : `Créer la session (${selectedIds.length} question${selectedIds.length > 1 ? "s" : ""})`}
          </button>

          <a
            href="/join"
            className="mt-3 block text-center text-sm font-bold text-[rgb(var(--ink-3))] transition hover:text-[rgb(var(--accent))]"
          >
            Rejoindre une session élève
          </a>
        </div>
      </div>
    </main>
  );
}
