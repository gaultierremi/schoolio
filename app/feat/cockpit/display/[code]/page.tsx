"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { Mic } from "lucide-react";

type DisplaySnapshot = {
  code: string;
  current_page: number;
  total_pages: number;
  projected_question_id: string | null;
  show_answer: boolean;
  listening_active: boolean;
  ended_at: string | null;
};

type ProjectedQuestion = {
  projected: boolean;
  id?: string;
  question?: string;
  options?: Array<{ letter: string; text: string; is_correct?: boolean }>;
  show_answer?: boolean;
  correct_answer_letter?: string;
  explanation?: string | null;
};

const POLL_INTERVAL_MS = 5_000;

function supabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default function DisplayPage() {
  const { code } = useParams<{ code: string }>();
  const [snapshot, setSnapshot] = useState<DisplaySnapshot | null>(null);
  const [question, setQuestion] = useState<ProjectedQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevProjectedIdRef = useRef<string | null>(null);

  async function fetchSnapshot() {
    try {
      const res = await fetch(`/api/feat/cockpit/display/${code}`);
      if (!res.ok) return;
      const data = await res.json() as DisplaySnapshot;
      setSnapshot(data);
      return data;
    } catch {
      return null;
    }
  }

  async function fetchQuestion(snap: DisplaySnapshot) {
    if (!snap.projected_question_id) {
      setQuestion({ projected: false });
      return;
    }
    if (snap.projected_question_id === prevProjectedIdRef.current && question?.projected) return;
    try {
      const res = await fetch(`/api/feat/cockpit/display/${code}/projected-question`);
      if (res.ok) {
        const q = await res.json() as ProjectedQuestion;
        setQuestion(q);
        prevProjectedIdRef.current = snap.projected_question_id;
      }
    } catch {
      // noop
    }
  }

  // Bootstrap
  useEffect(() => {
    async function init() {
      const snap = await fetchSnapshot();
      if (snap) await fetchQuestion(snap);
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Supabase Realtime subscription
  useEffect(() => {
    const client = supabaseAnon();
    const channel = client
      .channel(`cockpit_display_${code}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cockpit_sessions",
          filter: `code=eq.${code.toUpperCase()}`,
        },
        async (payload) => {
          const updated = payload.new as DisplaySnapshot;
          setSnapshot(updated);
          await fetchQuestion(updated);
        },
      )
      .subscribe();

    // 5s polling fallback for resilience
    pollRef.current = setInterval(async () => {
      const snap = await fetchSnapshot();
      if (snap) await fetchQuestion(snap);
    }, POLL_INTERVAL_MS);

    return () => {
      channel.unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-950">
        <p className="text-stone-400">Session introuvable. Vérifie le code.</p>
      </div>
    );
  }

  if (snapshot.ended_at) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-stone-950 text-center px-8">
        <div className="text-5xl">✅</div>
        <h1 className="font-serif text-3xl font-bold text-white">Cours terminé</h1>
        <p className="text-stone-400 text-sm">Merci à tous.</p>
        <p className="font-mono text-xs text-stone-600 mt-6">#{code.toUpperCase()}</p>
      </div>
    );
  }

  const showingQuestion = question?.projected && question.question;
  const showingAnswer = showingQuestion && question.show_answer;

  return (
    <div className="relative flex h-screen flex-col bg-stone-950 overflow-hidden">
      {/* Watermark */}
      <div className="absolute top-3 right-4 flex items-center gap-2 z-10">
        {snapshot.listening_active && (
          <div className="flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1">
            <Mic size={12} className="text-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-400">Actif</span>
          </div>
        )}
        <span className="font-mono text-xs text-stone-600">#{code.toUpperCase()}</span>
      </div>

      {/* Page indicator (visible when no question) */}
      <AnimatePresence mode="wait">
        {!showingQuestion ? (
          <motion.div
            key="pdf-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col items-center justify-center px-8 text-center"
          >
            <p className="text-stone-600 text-xs uppercase tracking-widest font-bold mb-6">
              Cours en cours
            </p>
            <div className="rounded-3xl bg-stone-900 border border-stone-800 px-12 py-8">
              <p className="text-stone-500 text-sm mb-2">Page</p>
              <p className="font-mono text-7xl font-bold text-white">
                {snapshot.current_page}
              </p>
              {snapshot.total_pages > 0 && (
                <p className="text-stone-500 text-sm mt-2">/ {snapshot.total_pages}</p>
              )}
            </div>
            <p className="mt-8 text-stone-700 text-xs">
              La question apparaîtra ici quand le prof la projette
            </p>
          </motion.div>
        ) : showingAnswer ? (
          /* Answer revealed */
          <motion.div
            key="answer-mode"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col justify-center px-6 py-8 max-w-2xl mx-auto w-full"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-4">
              Réponse
            </p>
            <h2 className="font-serif text-2xl font-bold text-white leading-snug mb-6">
              {question.question}
            </h2>
            <div className="space-y-3">
              {question.options?.map((opt) => (
                <div
                  key={opt.letter}
                  className={`rounded-2xl px-5 py-4 flex items-start gap-4 border transition-colors ${
                    opt.is_correct
                      ? "bg-emerald-500/20 border-emerald-500/60"
                      : "bg-stone-900 border-stone-800 opacity-50"
                  }`}
                >
                  <span
                    className={`shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold ${
                      opt.is_correct ? "bg-emerald-500 text-white" : "bg-stone-800 text-stone-400"
                    }`}
                  >
                    {opt.letter}
                  </span>
                  <p className={`text-base leading-snug ${opt.is_correct ? "text-white font-semibold" : "text-stone-400"}`}>
                    {opt.text}
                  </p>
                </div>
              ))}
            </div>
            {question.explanation && (
              <p className="mt-6 text-sm text-stone-400 leading-relaxed italic">
                {question.explanation}
              </p>
            )}
          </motion.div>
        ) : (
          /* Question projected, answer hidden */
          <motion.div
            key="question-mode"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col justify-center px-6 py-8 max-w-2xl mx-auto w-full"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-4">
              Question
            </p>
            <h2 className="font-serif text-2xl font-bold text-white leading-snug mb-6">
              {question.question}
            </h2>
            <div className="space-y-3">
              {question.options?.map((opt) => (
                <div
                  key={opt.letter}
                  className="rounded-2xl bg-stone-900 border border-stone-800 px-5 py-4 flex items-start gap-4"
                >
                  <span className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center bg-stone-800 text-stone-400 text-sm font-bold">
                    {opt.letter}
                  </span>
                  <p className="text-base text-stone-200 leading-snug">{opt.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-stone-600">
              En attente de la réponse…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
