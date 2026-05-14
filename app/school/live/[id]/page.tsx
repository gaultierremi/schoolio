"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Play, Eye, Shuffle, ChevronRight, Square, Users, Sparkles } from "lucide-react";

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

type Participant = {
  student_user_id: string;
  display_name: string;
};

type AnswerRow = {
  question_id: string;
  student_user_id: string;
  answer_index: number;
  is_correct: boolean;
};

export default function LiveSessionHostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: s } = await supabase
      .from("live_sessions")
      .select("id, code, title, phase, current_index, question_ids, picked_student_id, ended_at")
      .eq("id", id)
      .maybeSingle();
    if (!s) return;
    setSession(s as Session);

    const { data: qs } = await supabase
      .from("teacher_questions")
      .select("id, question, options, answer_index")
      .in("id", (s as Session).question_ids);
    setQuestions((qs ?? []) as Question[]);

    const { data: ps } = await supabase
      .from("live_session_participants")
      .select("student_user_id, display_name")
      .eq("session_id", id);
    setParticipants((ps ?? []) as Participant[]);

    const { data: as } = await supabase
      .from("live_session_answers")
      .select("question_id, student_user_id, answer_index, is_correct")
      .eq("session_id", id);
    setAnswers((as ?? []) as AnswerRow[]);

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    loadAll();

    // Subscribe to realtime updates on the 3 related tables.
    const channel = supabase
      .channel(`live-session-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions", filter: `id=eq.${id}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "live_session_participants", filter: `session_id=eq.${id}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "live_session_answers", filter: `session_id=eq.${id}` }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase, loadAll]);

  async function act(action: string) {
    if (acting || !session) return;
    setActing(true);
    try {
      await fetch(`/api/live/${session.id}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // The realtime subscription will refresh state.
    } finally {
      setActing(false);
    }
  }

  const currentQuestion = session && questions[session.current_index];
  const answersForCurrent = useMemo(
    () => (currentQuestion ? answers.filter((a) => a.question_id === currentQuestion.id) : []),
    [answers, currentQuestion],
  );
  const respondedCount = answersForCurrent.length;
  const correctCount = answersForCurrent.filter((a) => a.is_correct).length;
  const pickedParticipant = session?.picked_student_id
    ? participants.find((p) => p.student_user_id === session.picked_student_id)
    : null;
  const pickedAnswer = pickedParticipant && currentQuestion
    ? answersForCurrent.find((a) => a.student_user_id === pickedParticipant.student_user_id)
    : null;

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
        <p className="mx-auto max-w-4xl text-sm text-gray-400">Chargement…</p>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
        <p className="mx-auto max-w-4xl text-sm text-gray-400">Session introuvable.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/school" className="text-sm text-gray-500 hover:text-gray-300">
          ← Espace prof
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">{session.title}</h1>
            <p className="mt-1 text-sm text-gray-400">
              Question {session.current_index + 1} / {session.question_ids.length} · Phase :{" "}
              <span className="font-bold text-white">{session.phase}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-purple-500/40 bg-purple-500/10 px-5 py-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-purple-300">Code de session</p>
            <p className="font-mono text-3xl font-black tracking-widest text-white">{session.code}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">
              {participants.length} élève{participants.length !== 1 ? "s" : ""} en ligne
            </p>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Question + answers stats */}
          <section className="space-y-4">
            {currentQuestion ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <p className="serif text-xl font-bold leading-snug text-white">{currentQuestion.question}</p>
                <ol className="mt-5 space-y-2">
                  {currentQuestion.options.map((opt, idx) => {
                    const votes = answersForCurrent.filter((a) => a.answer_index === idx).length;
                    const isCorrect = idx === currentQuestion.answer_index;
                    const showReveal = session.phase === "revealed" || session.phase === "picked";
                    return (
                      <li
                        key={idx}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                          showReveal && isCorrect
                            ? "border-green-500 bg-green-500/10 text-green-200"
                            : "border-gray-700 text-gray-300"
                        }`}
                      >
                        <span className="font-bold text-gray-500">{String.fromCharCode(65 + idx)}.</span>
                        <span className="flex-1">{opt}</span>
                        <span className="font-mono text-xs text-gray-500">{votes}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Pas de question courante.</p>
            )}

            {pickedParticipant && pickedAnswer && currentQuestion && (
              <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 p-6">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                  <Sparkles className="h-4 w-4" />
                  Tiré au sort — c&apos;est à toi d&apos;expliquer
                </p>
                <p className="serif mt-3 text-3xl font-black text-white">{pickedParticipant.display_name}</p>
                <p className="mt-3 text-sm text-amber-200">
                  Sa réponse : <strong>{currentQuestion.options[pickedAnswer.answer_index]}</strong>{" "}
                  {pickedAnswer.is_correct ? "(correcte)" : "(incorrecte)"}
                </p>
              </div>
            )}
          </section>

          {/* Controls + stats */}
          <aside className="space-y-3">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Réponses</p>
              <p className="mt-1 font-mono text-3xl font-black text-white">
                {respondedCount} / {participants.length}
              </p>
              {session.phase === "revealed" || session.phase === "picked" ? (
                <p className="mt-1 text-xs text-green-400">
                  {correctCount} correcte{correctCount !== 1 ? "s" : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">en cours…</p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <p className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500">
                <Users className="h-3 w-3" />
                Participants
              </p>
              {participants.length === 0 ? (
                <p className="text-xs text-gray-500">Aucun élève pour l&apos;instant.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-gray-300">
                  {participants.map((p) => (
                    <li key={p.student_user_id}>{p.display_name}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Action panel */}
            <div className="space-y-2 rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-purple-300">Contrôles</p>

              {session.phase === "lobby" && (
                <button
                  onClick={() => act("start_question")}
                  disabled={acting || participants.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-2.5 font-bold text-gray-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Démarrer la 1ère question
                </button>
              )}

              {session.phase === "answering" && (
                <>
                  <button
                    onClick={() => act("reveal")}
                    disabled={acting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/50 bg-purple-500/10 px-4 py-2.5 font-bold text-purple-300 transition hover:bg-purple-500/20 disabled:opacity-50"
                  >
                    <Eye className="h-4 w-4" />
                    Révéler la réponse
                  </button>
                  <button
                    onClick={() => act("pick_random")}
                    disabled={acting || respondedCount === 0}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 font-bold text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Shuffle className="h-4 w-4" />
                    Tirer un élève au sort
                  </button>
                </>
              )}

              {session.phase === "revealed" && (
                <button
                  onClick={() => act("pick_random")}
                  disabled={acting || respondedCount === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 font-bold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <Shuffle className="h-4 w-4" />
                  Tirer un élève au sort
                </button>
              )}

              {(session.phase === "revealed" || session.phase === "picked") &&
                session.current_index + 1 < session.question_ids.length && (
                  <button
                    onClick={() => act("next_question")}
                    disabled={acting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-2.5 font-bold text-gray-950 transition hover:bg-purple-400 disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                    Question suivante
                  </button>
                )}

              {(session.phase === "revealed" || session.phase === "picked") &&
                session.current_index + 1 >= session.question_ids.length && (
                  <button
                    onClick={() => act("end")}
                    disabled={acting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <Square className="h-4 w-4" />
                    Terminer la session
                  </button>
                )}

              {session.phase === "ended" && (
                <button
                  onClick={() => router.push("/school")}
                  className="w-full rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-bold text-gray-300 hover:text-white"
                >
                  Retour à l&apos;espace prof
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
