"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import TrainingCard from "@/components/TrainingCard";
import { createClient } from "@/lib/supabase-browser";
import type { QuizQuestion } from "@/lib/types";
import type { ConceptMastery } from "@/lib/concepts";

type SessionData = {
  questions: QuizQuestion[];
  source: string;
  mode: string;
  count: number;
  subject?: string;
  difficulty?: number;
  topic?: string;
};

type Recommendation = {
  type: "révision" | "progression" | "défi";
  message: string;
};

const REC_COLORS = {
  révision: "border-red-800 bg-red-950/30 text-red-300",
  progression: "border-amber-800 bg-amber-950/30 text-amber-300",
  défi: "border-green-800 bg-green-950/30 text-green-300",
} as const;

const REC_ICONS = {
  révision: "🔁",
  progression: "📈",
  défi: "🏆",
} as const;

export default function StudySessionPage() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [questionConcepts, setQuestionConcepts] = useState<
    Record<string, { id: string; name: string }[]>
  >({});
  const [initialMastery, setInitialMastery] = useState<Record<string, number>>(
    {}
  );
  const [weakConcepts, setWeakConcepts] = useState<ConceptMastery[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("study_session");
    if (!raw) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let parsed: SessionData;
    try {
      parsed = JSON.parse(raw) as SessionData;
    } catch {
      setNotFound(true);
      setLoading(false);
      return;
    }

    if (!parsed.questions?.length) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setSession(parsed);

    // Fire-and-forget: record session in study_sessions table
    fetch("/api/study-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: parsed.subject ?? "autre",
        source: parsed.source ?? "library",
        questionCount: parsed.questions.length,
        mode: parsed.mode ?? "normal",
        difficulty: parsed.difficulty ?? 1,
        topic: parsed.topic,
      }),
    }).catch(() => {});

    async function loadEnrichment(questions: QuizQuestion[]) {
      const supabase = createClient();
      const questionIds = questions.map((q) => q.id);

      type LinkRow = {
        question_id: string;
        concept_id: string;
        concept: { id: string; name: string };
      };

      const [linksRes, masteryRes] = await Promise.all([
        supabase
          .from("question_concepts")
          .select("question_id, concept_id, concept:concepts(id,name)")
          .in("question_id", questionIds),
        supabase
          .from("user_concept_mastery")
          .select(
            "concept_id, mastery_score, correct, attempts, next_review, concept:concepts(id,name)"
          )
          .order("mastery_score", { ascending: true }),
      ]);

      const links = ((linksRes.data ?? []) as unknown as LinkRow[]).filter(
        (l) => l.concept !== null
      );

      const conceptMap: Record<string, { id: string; name: string }[]> = {};
      for (const link of links) {
        if (!conceptMap[link.question_id]) conceptMap[link.question_id] = [];
        conceptMap[link.question_id].push(link.concept);
      }
      setQuestionConcepts(conceptMap);

      type MasteryRow = {
        concept_id: string;
        mastery_score: number;
        correct: number;
        attempts: number;
        next_review: string;
        concept: { id: string; name: string };
      };

      const rows = ((masteryRes.data ?? []) as unknown as MasteryRow[]).filter(
        (r) => r.concept !== null
      );

      const masteryMap: Record<string, number> = {};
      const weak: ConceptMastery[] = [];

      for (const r of rows) {
        masteryMap[r.concept_id] = r.mastery_score;
        if (r.mastery_score < 60) {
          weak.push({
            concept_id: r.concept_id,
            mastery_score: r.mastery_score,
            correct: r.correct,
            attempts: r.attempts,
            last_seen: r.next_review,
            next_review: r.next_review,
            concept: {
              ...r.concept,
              description: null,
              period: null,
              subject: "histoire",
              created_at: "",
            },
          });
        }
      }

      setInitialMastery(masteryMap);
      setWeakConcepts(weak.slice(0, 5));
    }

    loadEnrichment(parsed.questions).finally(() => setLoading(false));

    fetch("/api/study-recommendations")
      .then((r) => r.json())
      .then((json: { recommendations?: Recommendation[] }) => {
        setRecommendations(json.recommendations ?? []);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col bg-gray-950">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
      </main>
    );
  }

  if (notFound || !session) {
    return (
      <main className="flex min-h-screen flex-col bg-gray-950">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-gray-400">Session introuvable ou expirée.</p>
          <Link
            href="/study"
            className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-purple-500"
          >
            ← Créer une nouvelle session
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <Header />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4">
        <TrainingCard
          questions={session.questions}
          weakConcepts={weakConcepts}
          questionConcepts={questionConcepts}
          initialMastery={initialMastery}
        />

        {recommendations.length > 0 && (
          <div className="mb-10 flex flex-col gap-3">
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              Recommandations IA
            </p>
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${REC_COLORS[rec.type]}`}
              >
                <span className="text-base leading-none">
                  {REC_ICONS[rec.type]}
                </span>
                <p className="leading-relaxed">{rec.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
