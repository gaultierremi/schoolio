"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

type CourseOption = {
  id: string;
  title: string | null;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  questions_count: number;
};

type Assignment = { resource_id: string };

export default function NewAssignmentPage() {
  const { id: classId } = useParams<{ id: string }>();
  const router = useRouter();

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [priorAssignmentCount, setPriorAssignmentCount] = useState(0);
  const [priorCountLoading, setPriorCountLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState<"pdf" | "quiz">("pdf");
  const [resourceId, setResourceId] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Quiz-specific config
  const [questionsCount, setQuestionsCount] = useState(10);
  const [chapterPageStart, setChapterPageStart] = useState("");
  const [chapterPageEnd, setChapterPageEnd] = useState("");
  const [enableRecall, setEnableRecall] = useState(false);
  const [recallPct, setRecallPct] = useState(15);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((j: { courses?: CourseOption[] }) => {
        setCourses(j.courses ?? []);
        setCoursesLoading(false);
      })
      .catch(() => setCoursesLoading(false));
  }, []);

  // Fetch prior assignment count when a quiz course is selected
  useEffect(() => {
    if (resourceType !== "quiz" || !resourceId) {
      setPriorAssignmentCount(0);
      setEnableRecall(false);
      return;
    }
    setPriorCountLoading(true);
    fetch(`/api/classes/${classId}/assignments`)
      .then((r) => r.json())
      .then((j: { assignments?: Assignment[] }) => {
        const count = (j.assignments ?? []).filter(
          (a) => a.resource_id === resourceId
        ).length;
        setPriorAssignmentCount(count);
        if (count === 0) setEnableRecall(false);
      })
      .catch(() => setPriorAssignmentCount(0))
      .finally(() => setPriorCountLoading(false));
  }, [classId, resourceId, resourceType]);

  const filteredCourses = courses.filter((c) =>
    resourceType === "pdf" ? !!c.pdf_storage_path : c.questions_count > 0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !resourceId) {
      setError("Titre et cours sont requis.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || undefined,
      resource_type: resourceType,
      resource_id: resourceId,
      due_date: dueDate || undefined,
    };

    if (resourceType === "quiz") {
      body.questions_count = questionsCount;
      if (chapterPageStart && chapterPageEnd) {
        body.chapter_page_start = Number(chapterPageStart);
        body.chapter_page_end = Number(chapterPageEnd);
      }
      body.enable_recall = enableRecall;
      if (enableRecall) body.recall_pct = recallPct;
    }

    const res = await fetch(`/api/classes/${classId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { assignment?: { id: string }; error?: string };

    if (!res.ok) {
      setError(json.error ?? "Erreur lors de la création");
      setSubmitting(false);
      return;
    }

    router.push(`/school/classes/${classId}?tab=devoirs`);
  }

  function courseLabel(c: CourseOption): string {
    const subj = c.subject_enum ? SUBJECTS_BY_ID[c.subject_enum as SubjectId] : null;
    const parts = [c.title ?? "Sans titre"];
    if (subj) parts.push(`${subj.emoji} ${subj.label}`);
    if (c.level) parts.push(`Niv. ${c.level}`);
    return parts.join(" · ");
  }

  const recallDisabled = priorAssignmentCount === 0;
  const chapterRangeComplete = chapterPageStart !== "" && chapterPageEnd !== "";

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-xl">
        <a
          href={`/school/classes/${classId}`}
          className="text-xs text-gray-500 hover:text-gray-400"
        >
          ← Retour à la classe
        </a>

        <h1 className="mt-4 text-2xl font-black text-white">📋 Créer un devoir</h1>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-5 rounded-2xl border border-gray-800 bg-gray-900 p-6"
        >
          {/* Title */}
          <div>
            <label className="block text-sm font-bold text-gray-200">
              Titre <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Chapitre 3 — Lecture"
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-gray-200">
              Description <span className="text-gray-600 font-normal">(optionnel)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Instructions pour les élèves…"
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 resize-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-bold text-gray-200">
              Type de devoir <span className="text-red-400">*</span>
            </label>
            <div className="mt-2 flex gap-2">
              {(["pdf", "quiz"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setResourceType(t); setResourceId(""); }}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${
                    resourceType === t
                      ? "border-purple-500 bg-purple-500/20 text-purple-300"
                      : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {t === "pdf" ? "📄 PDF à lire" : "🧠 Quiz"}
                </button>
              ))}
            </div>
          </div>

          {/* Course selector */}
          <div>
            <label className="block text-sm font-bold text-gray-200">
              Cours <span className="text-red-400">*</span>
            </label>
            {coursesLoading ? (
              <div className="mt-2 h-10 animate-pulse rounded-xl bg-gray-800" />
            ) : filteredCourses.length === 0 ? (
              <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                {resourceType === "pdf"
                  ? "Aucun cours avec PDF. Importe d'abord un PDF dans ta bibliothèque de cours."
                  : "Aucun cours avec des questions validées. Crée et valide des questions depuis tes cours."}
              </div>
            ) : (
              <select
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-500"
              >
                <option value="">— Sélectionner un cours —</option>
                {filteredCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {courseLabel(c)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Quiz-specific config */}
          {resourceType === "quiz" && resourceId && (
            <div className="space-y-4 rounded-xl border border-gray-700 bg-gray-950/50 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Configuration du quiz</p>

              {/* Questions count */}
              <div>
                <label className="block text-sm font-bold text-gray-200">
                  Nombre de questions
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={30}
                    value={questionsCount}
                    onChange={(e) => setQuestionsCount(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="w-8 text-center font-black text-white text-lg">{questionsCount}</span>
                </div>
                <p className="mt-1 text-xs text-gray-600">entre 5 et 30 questions</p>
              </div>

              {/* Chapter page range */}
              <div>
                <label className="block text-sm font-bold text-gray-200">
                  Pages du chapitre <span className="text-gray-600 font-normal">(optionnel)</span>
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={chapterPageStart}
                    onChange={(e) => setChapterPageStart(e.target.value)}
                    placeholder="De"
                    className="w-24 rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  />
                  <span className="text-gray-600">à</span>
                  <input
                    type="number"
                    min={1}
                    value={chapterPageEnd}
                    onChange={(e) => setChapterPageEnd(e.target.value)}
                    placeholder="À"
                    className="w-24 rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  Limite les questions aux pages de ce chapitre
                </p>
              </div>

              {/* Recall toggle */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-bold text-gray-200">
                      Rappel des chapitres précédents
                    </label>
                    {recallDisabled ? (
                      <p className="mt-0.5 text-xs text-gray-600">
                        {priorCountLoading ? "Vérification…" : "Disponible dès le 2ème devoir sur ce cours"}
                      </p>
                    ) : (
                      !chapterRangeComplete && (
                        <p className="mt-0.5 text-xs text-gray-600">Spécifie une plage de pages pour activer</p>
                      )
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={recallDisabled || !chapterRangeComplete}
                    onClick={() => setEnableRecall((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors focus:outline-none disabled:opacity-40 ${
                      enableRecall
                        ? "border-purple-500 bg-purple-500"
                        : "border-gray-600 bg-gray-800"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        enableRecall ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {enableRecall && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-400">
                      Part de rappel : <span className="font-black text-purple-300">{recallPct}%</span>
                      <span className="ml-2 text-gray-600">({100 - recallPct}% chapitre)</span>
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={5}
                      value={recallPct}
                      onChange={(e) => setRecallPct(Number(e.target.value))}
                      className="mt-1 w-full accent-purple-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Due date */}
          <div>
            <label className="block text-sm font-bold text-gray-200">
              Date limite <span className="text-gray-600 font-normal">(optionnel)</span>
            </label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !title.trim() || !resourceId}
            className="w-full rounded-2xl bg-purple-500 py-3.5 font-black text-gray-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Création..." : "Créer le devoir"}
          </button>
        </form>
      </div>
    </main>
  );
}
