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
      <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">
        <p className="text-center text-sm text-red-400">{error}</p>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p className="text-sm text-gray-400">Connexion à la session…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-500">Quiz live</p>
          <p className="mt-1 font-bold text-white">{session.title}</p>
          <p className="mt-1 text-xs text-gray-500">
            Question {session.current_index + 1} / {session.question_ids.length}
          </p>
        </header>

        {session.phase === "lobby" && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
            <Hourglass className="mx-auto h-8 w-8 text-gray-500" />
            <p className="mt-3 text-sm text-gray-400">
              Le prof n&apos;a pas encore lancé la 1ère question. Reste prêt !
            </p>
          </div>
        )}

        {session.phase === "ended" && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
            <p className="text-2xl font-black text-white">Session terminée</p>
            <p className="mt-2 text-sm text-gray-400">Merci d&apos;avoir joué !</p>
          </div>
        )}

        {(session.phase === "answering" || session.phase === "revealed" || session.phase === "picked") &&
          currentQuestion && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              {isPickedMe && (
                <div className="mb-4 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-3 text-center">
                  <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Tu as été tiré au sort
                  </p>
                  <p className="mt-1 text-sm text-amber-100">À toi d&apos;expliquer ta réponse à voix haute !</p>
                </div>
              )}

              <p className="serif text-lg font-bold leading-snug text-white">{currentQuestion.question}</p>

              <div className="mt-5 space-y-2">
                {currentQuestion.options.map((opt, idx) => {
                  const myPick = myAnswerForCurrent?.answer_index === idx;
                  const showReveal = session.phase === "revealed" || session.phase === "picked";
                  const isCorrect = idx === currentQuestion.answer_index;
                  let cls = "border-gray-700 text-gray-300 hover:border-purple-500/60";
                  if (showReveal) {
                    cls = isCorrect
                      ? "border-green-500 bg-green-500/10 text-green-200 font-bold"
                      : myPick
                      ? "border-red-500 bg-red-500/10 text-red-300"
                      : "border-gray-800 text-gray-600";
                  } else if (myPick) {
                    cls = "border-purple-500 bg-purple-500/10 text-purple-200";
                  }
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      disabled={
                        session.phase !== "answering" || !!myAnswerForCurrent || submitting
                      }
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${cls} disabled:cursor-not-allowed`}
                    >
                      <span className="mr-2 font-bold text-gray-500">{String.fromCharCode(65 + idx)}.</span>
                      {opt}
                      {showReveal && isCorrect && <Check className="ml-2 inline h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>

              {session.phase === "answering" && myAnswerForCurrent && (
                <p className="mt-4 text-center text-xs text-gray-400">
                  Réponse envoyée. En attente des autres…
                </p>
              )}

              {(session.phase === "revealed" || session.phase === "picked") && myAnswerForCurrent && (
                <p className="mt-4 text-center text-xs">
                  {myAnswerForCurrent.is_correct ? (
                    <span className="text-green-400">Bonne réponse !</span>
                  ) : (
                    <span className="text-red-400">Pas la bonne — revois la théorie après le cours.</span>
                  )}
                </p>
              )}
            </div>
          )}
      </div>
    </main>
  );
}
