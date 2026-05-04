"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import SubjectSelector from "@/components/SubjectSelector";
import type { QuizQuestion, QuizQuestionType } from "@/lib/types";

type Phase =
  | "subject"
  | "source"
  | "loading"
  | "pdf-upload"
  | "topic-input"
  | "manual-build"
  | "config"
  | "preview"
  | "launching";

type SourceType = "mine" | "library" | "pdf" | "manual" | "topic";

type GeneratedQuestion = {
  type: "mcq" | "truefalse";
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
  period: string;
};

function mapGenerated(q: GeneratedQuestion, i: number): QuizQuestion {
  return {
    id: `gen-${i}-${Date.now()}`,
    type: q.type as QuizQuestionType,
    question: q.question,
    options: q.options,
    answer_index: q.answer_index,
    explanation: q.explanation ?? null,
    period: q.period ?? null,
    difficulty: 1,
    status: "approved",
    rejection_reason: null,
    created_at: new Date().toISOString(),
  };
}

function currentStep(phase: Phase): 1 | 2 | 3 | 4 {
  if (phase === "subject") return 1;
  if (
    phase === "source" ||
    phase === "loading" ||
    phase === "pdf-upload" ||
    phase === "topic-input" ||
    phase === "manual-build"
  )
    return 2;
  if (phase === "config") return 3;
  return 4;
}

export default function StudyWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("subject");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [rawPool, setRawPool] = useState<QuizQuestion[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [count, setCount] = useState<5 | 10 | 20>(10);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<"normal" | "adaptive">("normal");
  const [previewQuestions, setPreviewQuestions] = useState<QuizQuestion[]>([]);
  const [editState, setEditState] = useState<{ idx: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual builder state
  const [manualList, setManualList] = useState<QuizQuestion[]>([]);
  const [mqText, setMqText] = useState("");
  const [mqOptions, setMqOptions] = useState(["", "", "", ""]);
  const [mqCorrect, setMqCorrect] = useState(0);
  const [mqType, setMqType] = useState<"mcq" | "truefalse">("mcq");

  const step = currentStep(phase);
  const stepLabels = ["Matière", "Source", "Config", "Aperçu"];

  // ─── Source handlers ────────────────────────────────────────────────────────

  async function handleSelectSource(src: SourceType) {
    setError(null);
    setSourceType(src);

    if (src === "pdf") { setPhase("pdf-upload"); return; }
    if (src === "manual") { setManualList([]); setPhase("manual-build"); return; }
    if (src === "topic") { setPhase("topic-input"); return; }

    setPhase("loading");
    try {
      const supabase = createClient();

      if (src === "mine") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Non connecté");

        const { data, error: err } = await supabase
          .from("teacher_questions")
          .select("*")
          .eq("user_id", user.id)
          .limit(200);

        if (err) throw new Error(err.message);

        type TQ = {
          id: string;
          type: string;
          question: string;
          options: string[];
          answer_index: number;
          explanation: string | null;
          period: string | null;
          difficulty: number | null;
          created_at: string;
        };

        const mapped = ((data ?? []) as TQ[]).map((tq) => ({
          id: tq.id,
          type: tq.type as QuizQuestionType,
          question: tq.question,
          options: tq.options,
          answer_index: tq.answer_index,
          explanation: tq.explanation ?? null,
          period: tq.period ?? null,
          difficulty: ((tq.difficulty ?? 1) as 1 | 2 | 3),
          status: "approved" as const,
          rejection_reason: null,
          created_at: tq.created_at,
        }));

        if (mapped.length === 0)
          throw new Error(
            "Aucune question. Soumettez d'abord des questions via le mode Professeur."
          );
        setRawPool(mapped);
      } else {
        const { data, error: err } = await supabase
          .from("quiz_questions")
          .select("*")
          .eq("status", "approved")
          .limit(300);

        if (err) throw new Error(err.message);
        if (!data?.length)
          throw new Error("Aucune question disponible dans la bibliothèque.");
        setRawPool(data as QuizQuestion[]);
      }

      setPhase("config");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setPhase("source");
    }
  }

  async function handlePdfFile(file: File) {
    setError(null);
    setPhase("loading");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64: base64,
          subject: selectedSubject,
          count: 20,
          difficulty,
        }),
      });

      const json = (await res.json()) as {
        questions?: GeneratedQuestion[];
        error?: string;
      };
      if (json.error) throw new Error(json.error);
      if (!json.questions?.length)
        throw new Error("Aucune question extraite du PDF.");

      setRawPool(json.questions.map((q, i) => mapGenerated(q, i)));
      setPhase("config");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur extraction PDF");
      setPhase("pdf-upload");
    }
  }

  // ─── Manual builder ─────────────────────────────────────────────────────────

  function handleAddManual() {
    const opts =
      mqType === "truefalse"
        ? ["Vrai", "Faux"]
        : mqOptions.filter((o) => o.trim());
    if (!mqText.trim() || opts.length < 2) return;

    setManualList((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}-${Math.random()}`,
        type: mqType,
        question: mqText.trim(),
        options: opts,
        answer_index: Math.min(mqCorrect, opts.length - 1),
        explanation: null,
        period: null,
        difficulty: 1,
        status: "approved",
        rejection_reason: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setMqText("");
    setMqOptions(["", "", "", ""]);
    setMqCorrect(0);
  }

  // ─── Config → Preview ────────────────────────────────────────────────────────

  async function handleGoToPreview() {
    setError(null);
    setPhase("launching");
    try {
      let finalQuestions: QuizQuestion[];

      if (mode === "adaptive") {
        const res = await fetch(`/api/adaptive-questions?count=${count}`);
        if (!res.ok) throw new Error("Erreur chargement adaptatif");
        const json = (await res.json()) as { questions?: QuizQuestion[] };
        finalQuestions = json.questions ?? [];
        if (finalQuestions.length === 0)
          throw new Error(
            "Aucune question adaptative. Jouez d'abord quelques parties en mode Quiz."
          );
      } else if (sourceType === "topic") {
        if (!topicInput.trim()) throw new Error("Entrez un sujet.");
        const res = await fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topicInput,
            subject: selectedSubject,
            count,
            difficulty,
          }),
        });
        const json = (await res.json()) as {
          questions?: GeneratedQuestion[];
          error?: string;
        };
        if (json.error) throw new Error(json.error);
        finalQuestions = (json.questions ?? []).map((q, i) =>
          mapGenerated(q, i)
        );
        if (finalQuestions.length === 0)
          throw new Error("Aucune question générée.");
      } else if (sourceType === "manual") {
        finalQuestions = manualList.slice(0, count);
        if (finalQuestions.length === 0) throw new Error("Aucune question.");
      } else {
        const shuffled = [...rawPool].sort(() => Math.random() - 0.5);
        finalQuestions = shuffled.slice(0, count);
        if (finalQuestions.length === 0)
          throw new Error("Aucune question disponible.");
      }

      setPreviewQuestions(finalQuestions);
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setPhase("config");
    }
  }

  // ─── Launch session ──────────────────────────────────────────────────────────

  function handleLaunchSession() {
    if (previewQuestions.length === 0) return;
    sessionStorage.setItem(
      "study_session",
      JSON.stringify({
        questions: previewQuestions,
        source: sourceType,
        mode,
        count: previewQuestions.length,
        subject: selectedSubject,
        difficulty,
        topic: topicInput || undefined,
      })
    );
    router.push("/study/session");
  }

  // ─── Preview editing ─────────────────────────────────────────────────────────

  function commitEdit() {
    if (!editState) return;
    setPreviewQuestions((prev) =>
      prev.map((q, i) =>
        i === editState.idx ? { ...q, question: editState.text } : q
      )
    );
    setEditState(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
      {/* Step indicator */}
      <div className="flex items-center">
        {stepLabels.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition-colors ${
                    done
                      ? "bg-purple-600 text-white"
                      : active
                        ? "bg-purple-500 text-white"
                        : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {done ? "✓" : n}
                </div>
                <span
                  className={`text-xs font-medium ${
                    active
                      ? "text-purple-400"
                      : done
                        ? "text-purple-600"
                        : "text-gray-600"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < stepLabels.length - 1 && (
                <div
                  className={`mb-4 h-px flex-1 mx-2 ${done ? "bg-purple-600" : "bg-gray-800"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ─── Phase: subject ─────────────────────────────────────────────────── */}
      {phase === "subject" && (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-xl font-black text-white">Quelle matière ?</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sélectionne la matière que tu veux étudier.
            </p>
          </div>
          <SubjectSelector
            selected={selectedSubject ? [selectedSubject] : []}
            onToggle={(id) => setSelectedSubject(id)}
          />
          <button
            type="button"
            onClick={() => { if (selectedSubject) setPhase("source"); }}
            disabled={!selectedSubject}
            className="rounded-xl bg-purple-600 py-3 font-black text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Continuer →
          </button>
        </div>
      )}

      {/* ─── Phase: source ──────────────────────────────────────────────────── */}
      {phase === "source" && (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-xl font-black text-white">
              Source des questions
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              D&apos;où viennent tes questions ?
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Topic — full width, highlighted */}
            <button
              type="button"
              onClick={() => handleSelectSource("topic")}
              className="col-span-2 flex items-center gap-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 text-left transition-all hover:border-purple-400/60 hover:bg-purple-500/15 active:scale-[0.98]"
            >
              <span className="text-2xl">💬</span>
              <div>
                <p className="text-sm font-black text-white">Sujet libre</p>
                <p className="text-xs text-gray-500">
                  Claude génère des questions sur n&apos;importe quel sujet
                </p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-purple-300">
                IA
              </span>
            </button>

            {(
              [
                { id: "pdf" as const, emoji: "📄", label: "PDF", desc: "Extraction Claude" },
                { id: "library" as const, emoji: "🌍", label: "Bibliothèque", desc: "Quiz validés" },
                { id: "mine" as const, emoji: "📚", label: "Mes questions", desc: "Vos soumissions" },
                { id: "manual" as const, emoji: "✍️", label: "Manuel", desc: "Écrire les questions" },
              ] as const
            ).map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => handleSelectSource(src.id)}
                className="flex flex-col items-start gap-2 rounded-2xl border border-gray-700 bg-gray-900 p-4 text-left transition-all hover:border-gray-600 hover:bg-gray-800 active:scale-[0.98]"
              >
                <span className="text-2xl">{src.emoji}</span>
                <div>
                  <p className="text-sm font-black text-white">{src.label}</p>
                  <p className="text-xs text-gray-500">{src.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPhase("subject")}
            className="text-center text-sm text-gray-600 transition hover:text-gray-400"
          >
            ← Choisir une autre matière
          </button>
        </div>
      )}

      {/* ─── Phase: loading / launching ─────────────────────────────────────── */}
      {(phase === "loading" || phase === "launching") && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <p className="text-sm text-gray-400">
            {phase === "launching"
              ? "Génération des questions…"
              : "Chargement…"}
          </p>
        </div>
      )}

      {/* ─── Phase: pdf-upload ──────────────────────────────────────────────── */}
      {phase === "pdf-upload" && (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-xl font-black text-white">Uploader un PDF</h2>
            <p className="mt-1 text-sm text-gray-500">
              Claude extraira les questions automatiquement
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-700 p-10 text-center transition hover:border-purple-500/50 hover:bg-gray-900"
          >
            <span className="text-4xl">📄</span>
            <div>
              <p className="font-bold text-white">Cliquer pour choisir un PDF</p>
              <p className="mt-1 text-xs text-gray-500">Format PDF uniquement</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPhase("source")}
            className="text-center text-sm text-gray-600 transition hover:text-gray-400"
          >
            ← Retour
          </button>
        </div>
      )}

      {/* ─── Phase: topic-input ─────────────────────────────────────────────── */}
      {phase === "topic-input" && (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-xl font-black text-white">Sujet libre</h2>
            <p className="mt-1 text-sm text-gray-500">
              Claude génère des questions sur ce sujet
            </p>
          </div>
          <textarea
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && topicInput.trim()) {
                e.preventDefault();
                setPhase("config");
              }
            }}
            placeholder={
              "Ex: La Révolution française, Les équations du second degré, " +
              "Le code du travail en France, L'anatomie du cœur…"
            }
            rows={4}
            autoFocus
            className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPhase("source")}
              className="rounded-xl border border-gray-700 px-5 py-3 text-sm font-bold text-gray-400 transition hover:text-white"
            >
              ← Retour
            </button>
            <button
              type="button"
              onClick={() => { if (topicInput.trim()) setPhase("config"); }}
              disabled={!topicInput.trim()}
              className="flex-1 rounded-xl bg-purple-600 py-3 font-black text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Configurer →
            </button>
          </div>
        </div>
      )}

      {/* ─── Phase: manual-build ────────────────────────────────────────────── */}
      {phase === "manual-build" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-white">
                Créer les questions
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {manualList.length} question
                {manualList.length > 1 ? "s" : ""} ajoutée
                {manualList.length > 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhase("source")}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              ← Retour
            </button>
          </div>

          <div className="flex gap-2">
            {(["mcq", "truefalse"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setMqType(t); setMqCorrect(0); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  mqType === t
                    ? "bg-purple-600 text-white"
                    : "border border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {t === "mcq" ? "QCM" : "Vrai / Faux"}
              </button>
            ))}
          </div>

          <textarea
            value={mqText}
            onChange={(e) => setMqText(e.target.value)}
            placeholder="Énoncé de la question…"
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
          />

          {mqType === "mcq" && (
            <div className="flex flex-col gap-2">
              {mqOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={mqCorrect === i}
                    onChange={() => setMqCorrect(i)}
                    className="accent-purple-500"
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const copy = [...mqOptions];
                      copy[i] = e.target.value;
                      setMqOptions(copy);
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              ))}
              <p className="text-xs text-gray-600">● = bonne réponse</p>
            </div>
          )}

          {mqType === "truefalse" && (
            <div className="flex gap-4">
              {["Vrai", "Faux"].map((opt, i) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="tfcorrect"
                    checked={mqCorrect === i}
                    onChange={() => setMqCorrect(i)}
                    className="accent-purple-500"
                  />
                  <span className="text-sm text-gray-300">{opt}</span>
                </label>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleAddManual}
            disabled={
              !mqText.trim() ||
              (mqType === "mcq" && mqOptions.filter((o) => o.trim()).length < 2)
            }
            className="rounded-xl border border-purple-500/50 bg-purple-500/10 py-2.5 text-sm font-bold text-purple-300 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            + Ajouter cette question
          </button>

          {manualList.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                Questions ajoutées
              </p>
              {manualList.map((q, i) => (
                <div
                  key={q.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2"
                >
                  <span className="flex-1 truncate text-sm text-gray-300">
                    {i + 1}. {q.question}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setManualList((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="shrink-0 text-xs text-red-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (manualList.length > 0) {
                setRawPool(manualList);
                setPhase("config");
              }
            }}
            disabled={manualList.length === 0}
            className="rounded-xl bg-purple-600 py-3 font-black text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Terminer ({manualList.length} question
            {manualList.length > 1 ? "s" : ""}) →
          </button>
        </div>
      )}

      {/* ─── Phase: config ──────────────────────────────────────────────────── */}
      {phase === "config" && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-black text-white">Configuration</h2>
            <p className="mt-1 text-sm text-gray-500">
              {sourceType === "topic"
                ? `Sujet : "${topicInput}"`
                : sourceType === "manual"
                  ? `${manualList.length} questions créées manuellement`
                  : `${rawPool.length} question${rawPool.length > 1 ? "s" : ""} disponible${rawPool.length > 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Count */}
          <div>
            <p className="mb-2 text-sm font-black text-gray-400">
              Nombre de questions
            </p>
            <div className="flex gap-2">
              {([5, 10, 20] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`flex-1 rounded-xl py-3 text-sm font-black transition ${
                    count === n
                      ? "bg-purple-600 text-white"
                      : "border border-gray-700 text-gray-400 hover:border-purple-500/50 hover:text-white"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          {sourceType !== "manual" && (
            <div>
              <p className="mb-2 text-sm font-black text-gray-400">Difficulté</p>
              <div className="flex gap-2">
                {(
                  [
                    { id: 1, label: "Débutant",      stars: "★☆☆" },
                    { id: 2, label: "Intermédiaire", stars: "★★☆" },
                    { id: 3, label: "Expert",         stars: "★★★" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id)}
                    className={`flex flex-1 flex-col items-center rounded-xl py-3 text-sm font-black transition ${
                      difficulty === d.id
                        ? "bg-purple-600 text-white"
                        : "border border-gray-700 text-gray-400 hover:border-purple-500/50 hover:text-white"
                    }`}
                  >
                    {d.label}
                    <span className="mt-0.5 text-[11px] font-normal tracking-wider opacity-70">
                      {d.stars}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Adaptive mode (only for library/mine sources) */}
          {sourceType !== "manual" && sourceType !== "topic" && (
            <div>
              <p className="mb-2 text-sm font-black text-gray-400">Mode</p>
              <div className="flex gap-2">
                {(
                  [
                    { id: "normal",   label: "Normal",       desc: "Aléatoire" },
                    { id: "adaptive", label: "🧠 Adaptatif", desc: "Selon tes lacunes" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`flex flex-1 flex-col items-center rounded-xl py-3 text-sm font-black transition ${
                      mode === m.id
                        ? "bg-purple-600 text-white"
                        : "border border-gray-700 text-gray-400 hover:border-purple-500/50 hover:text-white"
                    }`}
                  >
                    {m.label}
                    <span className="mt-0.5 text-[10px] font-normal opacity-70">
                      {m.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPhase("source")}
              className="rounded-xl border border-gray-700 px-5 py-3 text-sm font-bold text-gray-400 transition hover:text-white"
            >
              ← Retour
            </button>
            <button
              type="button"
              onClick={handleGoToPreview}
              className="flex-1 rounded-xl bg-purple-600 py-3 font-black text-white transition hover:bg-purple-500"
            >
              Aperçu →
            </button>
          </div>
        </div>
      )}

      {/* ─── Phase: preview ─────────────────────────────────────────────────── */}
      {phase === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-white">Aperçu</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {previewQuestions.length} question
                {previewQuestions.length > 1 ? "s" : ""} · Cliquer pour éditer
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhase("config")}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              ← Config
            </button>
          </div>

          <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
            {previewQuestions.map((q, i) => (
              <div
                key={q.id}
                className="flex items-start gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3"
              >
                <span className="mt-0.5 shrink-0 text-xs font-black text-gray-600">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  {editState?.idx === i ? (
                    <textarea
                      value={editState.text}
                      onChange={(e) =>
                        setEditState({ idx: i, text: e.target.value })
                      }
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit();
                        }
                      }}
                      autoFocus
                      rows={3}
                      className="w-full resize-none rounded-lg border border-purple-500 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  ) : (
                    <p
                      className="cursor-text text-sm text-gray-300 hover:text-white"
                      onClick={() =>
                        setEditState({ idx: i, text: q.question })
                      }
                    >
                      {q.question}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        q.type === "truefalse"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {q.type === "truefalse" ? "V/F" : "QCM"}
                    </span>
                    {q.period && (
                      <span className="text-[10px] text-gray-600">
                        {q.period}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewQuestions((prev) =>
                      prev.filter((_, j) => j !== i)
                    )
                  }
                  className="shrink-0 text-gray-700 transition-colors hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleLaunchSession}
            disabled={previewQuestions.length === 0}
            className="rounded-xl bg-purple-600 py-3 font-black text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Lancer la session ({previewQuestions.length} question
            {previewQuestions.length > 1 ? "s" : ""}) →
          </button>
        </div>
      )}
    </div>
  );
}
