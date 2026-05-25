"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Sparkles, Check, Hourglass } from "lucide-react";

type Phase = "lobby" | "answering" | "revealed" | "picked" | "ended";

type Session = {
  id: string;
  code: string;
  title: string;
  phase: Phase;
  current_index: number;
  question_ids: string[];
  picked_student_id: string | null;
  ended_at: string | null;
};

type Question = {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
};

type MyAnswer = {
  question_id: string;
  answer_index: number;
  is_correct: boolean;
};

export default function StudentLiveSessionPage() {
  const { code } = useParams<{ code: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [myAnswers, setMyAnswers] = useState<MyAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async (existingUserId?: string) => {
    const { data: s } = await supabase
      .from("live_sessions")
      .select("id, code, title, phase, current_index, question_ids, picked_student_id, ended_at")
      .eq("code", code)
      .maybeSingle();
    if (!s) {
      setError("Session introuvable ou terminée.");
      return null;
    }
    setSession(s as Session);

    const qid = (s as Session).question_ids[(s as Session).current_index];
    if (qid) {
      const { data: q } = await supabase
        .from("teacher_questions")
        .select("id, question, options, answer_index")
        .eq("id", qid)
        .maybeSingle();
      if (q) setCurrentQuestion(q as Question);
    }

    const uid = existingUserId ?? userId;
    if (uid) {
      const { data: as } = await supabase
        .from("live_session_answers")
        .select("question_id, answer_index, is_correct")
        .eq("session_id", (s as Session).id)
        .eq("student_user_id", uid);
      setMyAnswers((as ?? []) as MyAnswer[]);
    }

    return s as Session;
  }, [code, supabase, userId]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Tu dois être connecté pour rejoindre une session.");
        return;
      }
      setUserId(user.id);

      // Ensure we are registered as participant (idempotent)
      await fetch("/api/live/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const s = await loadSession(user.id);
      if (!s) return;

      channel = supabase
        .channel(`live-student-${s.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions", filter: `id=eq.${s.id}` }, () => loadSession(user.id))
        .subscribe();
    }
    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, supabase]);

  async function handleAnswer(idx: number) {
    if (!session || !currentQuestion || submitting) return;
    if (session.phase !== "answering") return;
    setSubmitting(true);
    try {
      await fetch(`/api/live/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer_index: idx }),
      });
      await loadSession();
    } finally {
      setSubmitting(false);
    }
  }

  const myAnswerForCurrent = useMemo(
    () => (currentQuestion ? myAnswers.find((a) => a.question_id === currentQuestion.id) : undefined),
    [currentQuestion, myAnswers],
  );

  const isPickedMe = !!session?.picked_student_id && session.picked_student_id === userId;

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <p role="alert" className="text-center text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm text-slate-600 dark:text-slate-400">Connexion à la session…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950" lang="fr-BE">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-700 dark:text-indigo-400">
            Quiz live
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {session.title}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Question {session.current_index + 1} / {session.question_ids.length}
          </p>
        </header>

        {session.phase === "lobby" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <Hourglass
              size={32}
              strokeWidth={1.5}
              aria-hidden="true"
              className="mx-auto text-slate-400 dark:text-slate-500"
            />
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Le prof n&apos;a pas encore lancé la 1<sup>re</sup> question. Reste prêt !
            </p>
          </div>
        )}

        {session.phase === "ended" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Session terminée
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Merci d&apos;avoir joué !
            </p>
          </div>
        )}

        {(session.phase === "answering" ||
          session.phase === "revealed" ||
          session.phase === "picked") &&
          currentQuestion && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              {isPickedMe && (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-center dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
                    <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
                    Tu as été tiré au sort
                  </p>
                  <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                    À toi d&apos;expliquer ta réponse à voix haute !
                  </p>
                </div>
              )}

              <p className="serif text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
                {currentQuestion.question}
              </p>

              <div className="mt-5 space-y-2">
                {currentQuestion.options.map((opt, idx) => {
                  const myPick = myAnswerForCurrent?.answer_index === idx;
                  const showReveal =
                    session.phase === "revealed" || session.phase === "picked";
                  const isCorrect = idx === currentQuestion.answer_index;
                  let cls =
                    "border-slate-300 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30";
                  if (showReveal) {
                    cls = isCorrect
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : myPick
                        ? "border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200"
                        : "border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-600";
                  } else if (myPick) {
                    cls =
                      "border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200";
                  }
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      disabled={
                        session.phase !== "answering" ||
                        !!myAnswerForCurrent ||
                        submitting
                      }
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${cls} disabled:cursor-not-allowed motion-reduce:transition-none`}
                    >
                      <span className="mr-2 font-semibold text-slate-500 dark:text-slate-400">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      {opt}
                      {showReveal && isCorrect && (
                        <Check
                          size={14}
                          strokeWidth={2}
                          aria-hidden="true"
                          className="ml-2 inline"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {session.phase === "answering" && myAnswerForCurrent && (
                <p
                  aria-live="polite"
                  className="mt-4 text-center text-xs text-slate-600 dark:text-slate-400"
                >
                  Réponse envoyée. En attente des autres…
                </p>
              )}

              {(session.phase === "revealed" || session.phase === "picked") &&
                myAnswerForCurrent && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-4 text-center text-xs"
                  >
                    {myAnswerForCurrent.is_correct ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        Bonne réponse !
                      </span>
                    ) : (
                      <span className="text-red-700 dark:text-red-300">
                        Pas la bonne — revois la théorie après le cours.
                      </span>
                    )}
                  </p>
                )}
            </div>
          )}
      </div>
    </main>
  );
}
