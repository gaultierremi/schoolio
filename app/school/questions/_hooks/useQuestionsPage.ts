import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { type SubjectId, type SchoolLevel, isValidSubject } from "@/lib/subjects";
import {
  BLANK_FORM,
  type TeacherQuestion,
  type DraftQuestion,
  type ProposeState,
  type PdfStats,
  type PublicQuestion,
  type ValTab,
} from "../_types";

export function useQuestionsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [isTeacher, setIsTeacher] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const [tab, setTab] = useState<"my" | "pdf" | "public">("my");
  const [valTab, setValTab] = useState<ValTab>("pending");

  // My questions
  const [myQuestions, setMyQuestions] = useState<TeacherQuestion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);

  // My questions filters + sort
  const [myFilterType, setMyFilterType] = useState("");
  const [myFilterPeriod, setMyFilterPeriod] = useState("");
  const [myFilterSubject, setMyFilterSubject] = useState<SubjectId | null>(null);
  const [myFilterLevel, setMyFilterLevel] = useState<SchoolLevel | null>(null);
  const [myFilterOrigin, setMyFilterOrigin] = useState<"" | "ai_generated" | "extracted_from_pdf">("");
  const [sortBy, setSortBy] = useState<"date" | "type" | "period">("date");

  // Validation state
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const [pendingStars, setPendingStars] = useState<Record<string, 1 | 2 | 3>>({});
  const [filterStars, setFilterStars] = useState<0 | 1 | 2 | 3>(0);
  const [valToast, setValToast] = useState<string | null>(null);

  const hasAutoSetTab = useRef(false);

  // Propose
  const [proposeStatuses, setProposeStatuses] = useState<Record<string, ProposeState>>({});

  // PDF
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfWarning, setPdfWarning] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStats, setPdfStats] = useState<PdfStats | null>(null);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [pdfSubject, setPdfSubject] = useState<SubjectId>("autre");
  const [pdfLevel, setPdfLevel] = useState<SchoolLevel | null>(null);

  // AI explanation generation
  const [generatingExplanation, setGeneratingExplanation] = useState(false);

  // Public library
  const [publicQuestions, setPublicQuestions] = useState<PublicQuestion[]>([]);
  const [pubFilterType, setPubFilterType] = useState("");
  const [pubFilterPeriod, setPubFilterPeriod] = useState("");
  const [pubFilterText, setPubFilterText] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  // ── Access check ──

  useEffect(() => {
    async function checkAccess() {
      const { data } = await supabase.rpc("is_current_user_school_teacher");
      setIsTeacher(data === true);
      setPageLoading(false);
    }
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMyQuestions(opts?: { autoTab?: boolean }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("teacher_questions")
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    const loaded = (data ?? []) as TeacherQuestion[];
    setMyQuestions(loaded);

    if (opts?.autoTab && !hasAutoSetTab.current) {
      hasAutoSetTab.current = true;
      const hasPending = loaded.some(
        (q) => (q.is_ai_generated === true || q.origin === "extracted_from_pdf") && !q.validated_at && !q.rejected_at
      );
      if (!hasPending) setValTab("validated");
    }
  }

  async function loadPublicQuestions() {
    const { data } = await supabase
      .from("quiz_questions")
      .select(
        "id, type, question, options, answer_index, explanation, period, difficulty"
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(200);

    setPublicQuestions((data ?? []) as PublicQuestion[]);
  }

  useEffect(() => {
    if (!isTeacher) return;
    loadMyQuestions({ autoTab: true });
    loadPublicQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher]);

  // ── Form helpers ──

  function resetForm() {
    setForm({ ...BLANK_FORM });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(q: TeacherQuestion) {
    // Hydrate les 5 slots short_text à partir du tableau DB (peut être null).
    const dbTextAnswers = Array.isArray(q.expected_text_answers)
      ? q.expected_text_answers
      : [];
    const hydratedTextAnswers = [...dbTextAnswers, "", "", "", "", ""].slice(0, 5);

    setForm({
      type: q.type,
      question: q.question,
      options:
        q.type === "truefalse"
          ? ["Vrai", "Faux", "", ""]
          : [...q.options, "", "", "", ""].slice(0, 4),
      answer_index: q.answer_index,
      explanation: q.explanation ?? "",
      subjectId: isValidSubject(q.subject_enum) ? q.subject_enum : "autre",
      level: (q.level ?? null) as SchoolLevel | null,
      period: q.period ?? "",
      expected_numeric_answer:
        q.expected_numeric_answer != null ? String(q.expected_numeric_answer) : "",
      numeric_tolerance:
        q.numeric_tolerance != null ? String(q.numeric_tolerance) : "",
      numeric_unit: q.numeric_unit ?? "",
      expected_text_answers: hydratedTextAnswers,
    });
    setEditingId(q.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveQuestion() {
    if (!form.question.trim()) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    // Options stockées en DB : seulement pertinentes pour mcq/truefalse.
    let options: string[];
    if (form.type === "truefalse") {
      options = ["Vrai", "Faux"];
    } else if (form.type === "mcq") {
      options = form.options.map((o) => o.trim()).filter(Boolean);
    } else {
      options = [];
    }

    if (form.type === "mcq" && options.length < 2) {
      alert("Ajoute au moins 2 options.");
      setSaving(false);
      return;
    }

    // Champs spécifiques par type — on envoie NULL quand non-applicable pour
    // ne pas polluer la row avec des résidus d'un ancien type.
    let expected_numeric_answer: number | null = null;
    let numeric_tolerance: number | null = null;
    let numeric_unit: string | null = null;
    let expected_text_answers: string[] | null = null;

    if (form.type === "numeric") {
      const parsed = Number(form.expected_numeric_answer);
      if (!Number.isFinite(parsed)) {
        alert("La réponse numérique doit être un nombre valide.");
        setSaving(false);
        return;
      }
      expected_numeric_answer = parsed;
      if (form.numeric_tolerance.trim().length > 0) {
        const tol = Number(form.numeric_tolerance);
        if (Number.isFinite(tol) && tol >= 0) numeric_tolerance = tol;
      }
      numeric_unit = form.numeric_unit.trim() || null;
    } else if (form.type === "short_text") {
      const cleaned = form.expected_text_answers
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      if (cleaned.length < 1) {
        alert("Ajoute au moins une réponse acceptable.");
        setSaving(false);
        return;
      }
      expected_text_answers = cleaned;
    }

    const payload = {
      teacher_id: user.id,
      type: form.type,
      question: form.question.trim(),
      options,
      answer_index:
        form.type === "mcq" || form.type === "truefalse"
          ? Math.min(form.answer_index, Math.max(options.length - 1, 0))
          : 0,
      explanation: form.explanation.trim() || null,
      subject: null,
      subject_enum: form.subjectId,
      level: form.level,
      period: form.period || null,
      expected_numeric_answer,
      numeric_tolerance,
      numeric_unit,
      expected_text_answers,
    };

    if (editingId) {
      await supabase
        .from("teacher_questions")
        .update(payload)
        .eq("id", editingId);
    } else {
      await supabase.from("teacher_questions").insert(payload);
    }

    await loadMyQuestions();
    resetForm();
    setSaving(false);
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Supprimer cette question définitivement ?")) return;
    await supabase.from("teacher_questions").delete().eq("id", id);
    setMyQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function togglePublic(q: TeacherQuestion) {
    await supabase
      .from("teacher_questions")
      .update({ is_public: !q.is_public })
      .eq("id", q.id);
    setMyQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, is_public: !x.is_public } : x))
    );
  }

  async function duplicateQuestion(q: TeacherQuestion) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("teacher_questions").insert({
      teacher_id: user.id,
      type: q.type,
      question: `Copie — ${q.question}`,
      options: q.options,
      answer_index: q.answer_index,
      explanation: q.explanation,
      subject: null,
      subject_enum: q.subject_enum ?? null,
      level: q.level ?? null,
      period: q.period,
      is_public: false,
      // Conserver les champs spécifiques au type pour que la copie soit
      // fonctionnellement identique.
      expected_numeric_answer: q.expected_numeric_answer ?? null,
      numeric_tolerance: q.numeric_tolerance ?? null,
      numeric_unit: q.numeric_unit ?? null,
      expected_text_answers: q.expected_text_answers ?? null,
    });

    await loadMyQuestions();
  }

  async function generateExplanation() {
    if (!form.question.trim()) return;
    setGeneratingExplanation(true);
    try {
      const options =
        form.type === "truefalse" ? ["Vrai", "Faux"] : form.options;
      const res = await fetch("/api/generate-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: form.question,
          options,
          answerIndex: form.answer_index,
        }),
      });
      const json = await res.json();
      if (json.explanation) {
        setForm({ ...form, explanation: json.explanation });
      }
    } catch {}
    setGeneratingExplanation(false);
  }

  // ── Validation ──

  async function validateQuestion(id: string) {
    setValidatingId(id);
    try {
      // difficulty_stars is already persisted via DifficultyStarsEditor PATCH
      // before the teacher clicks Valider — no need to re-send it here.
      const res = await fetch(`/api/teacher-questions/${id}/validation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");

      setFadingIds((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setMyQuestions((prev) =>
          prev.map((q) => (q.id === id ? { ...q, ...json.question } : q))
        );
        setFadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setValidatingId(null);
        setValToast("Question validée ✓");
        setTimeout(() => setValToast(null), 3000);
      }, 220);
    } catch (e) {
      setValidatingId(null);
      alert(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function rejectQuestion(id: string) {
    setRejectingId(id);
    try {
      const res = await fetch(`/api/teacher-questions/${id}/validation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");

      setFadingIds((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setMyQuestions((prev) =>
          prev.map((q) => (q.id === id ? { ...q, ...json.question } : q))
        );
        setFadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setRejectingId(null);
      }, 220);
    } catch (e) {
      setRejectingId(null);
      alert(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function callUnvalidate(id: string) {
    try {
      const res = await fetch(`/api/teacher-questions/${id}/validation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unvalidate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setMyQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, ...json.question } : q))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    }
  }

  // ── Difficulty override ──

  function updateQuestionDifficulty(id: string, newValue: 1 | 2 | 3 | null) {
    // Sync local list after the optimistic update already happened in DifficultyStarsEditor
    setMyQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, difficulty_stars: newValue } : q))
    );
  }

  // ── Propose ──

  async function proposeQuestion(id: string, force = false) {
    setProposeStatuses((prev) => ({ ...prev, [id]: { kind: "loading" } }));
    try {
      const res = await fetch("/api/propose-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: id, forcePropose: force }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProposeStatuses((prev) => ({ ...prev, [id]: { kind: "idle" } }));
        alert(json.error ?? "Erreur lors de la proposition.");
        return;
      }
      if (json.duplicate) {
        setProposeStatuses((prev) => ({
          ...prev,
          [id]: { kind: "duplicate", similarText: json.similar },
        }));
        return;
      }
      setProposeStatuses((prev) => ({ ...prev, [id]: { kind: "proposed" } }));
    } catch {
      setProposeStatuses((prev) => ({ ...prev, [id]: { kind: "idle" } }));
      alert("Erreur réseau.");
    }
  }

  // ── PDF ──

  async function handlePdfUpload(file: File) {
    const MAX_BYTES = 8 * 1024 * 1024;
    const WARN_BYTES = 4 * 1024 * 1024;

    if (file.size > MAX_BYTES) {
      setPdfError("PDF trop volumineux (max 8 Mo). Compresse-le sur ilovepdf.com");
      return;
    }

    setPdfWarning(
      file.size > WARN_BYTES
        ? "PDF volumineux, l'analyse peut prendre jusqu'à 60 secondes…"
        : null
    );
    setPdfError(null);
    setPdfLoading(true);
    setPdfStats(null);
    setDrafts([]);
    setPdfProgress(0);

    const startTime = Date.now();
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(95, Math.round((elapsed / 30000) * 95));
      setPdfProgress(pct);
    }, 300);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const res = await fetch("/api/extract-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf: base64, subject: pdfSubject, level: pdfLevel }),
        });
        const json = await res.json();
        clearInterval(intervalId);
        setPdfProgress(100);

        if (!res.ok || json.error) {
          setPdfError(json.error ?? "Erreur lors de l'analyse");
          setPdfLoading(false);
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const questions = (json.questions as any[]).map((q, i) => ({
          key: i,
          type: q.type ?? "mcq",
          question: q.question ?? "",
          options: Array.isArray(q.options) ? q.options : [],
          answer_index: q.answer_index ?? 0,
          explanation: q.explanation ?? "",
          period: q.period ?? "",
          kept: true,
        }));

        setDrafts(questions);
        setPdfStats({
          pageCount: typeof json.pageCount === "number" ? json.pageCount : null,
          questionCount: questions.length,
          fromCache: json.fromCache === true,
        });
      } catch {
        clearInterval(intervalId);
        setPdfError("Erreur réseau, réessaie.");
      }
      setPdfLoading(false);
    };
    reader.readAsDataURL(file);
  }

  async function saveDrafts() {
    const toSave = drafts.filter((d) => d.kept);
    if (!toSave.length) return;
    setSavingDrafts(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingDrafts(false);
      return;
    }

    await supabase.from("teacher_questions").insert(
      toSave.map((d) => ({
        teacher_id: user.id,
        type: d.type,
        question: d.question,
        options: d.options,
        answer_index: d.answer_index,
        explanation: d.explanation || null,
        period: d.period || null,
        subject: null,
        subject_enum: pdfSubject,
        level: pdfLevel,
      }))
    );

    await loadMyQuestions();
    setDrafts([]);
    setTab("my");
    setValTab("validated");
    setSavingDrafts(false);
  }

  // ── Public → my ──

  async function addPublicQuestion(q: PublicQuestion) {
    setAddingId(q.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAddingId(null);
      return;
    }

    await supabase.from("teacher_questions").insert({
      teacher_id: user.id,
      type: q.type,
      question: q.question,
      options: q.options,
      answer_index: q.answer_index,
      explanation: q.explanation ?? null,
      period: q.period ?? null,
      subject: null,
    });

    await loadMyQuestions();
    setAddingId(null);
  }

  // ── Derived lists ──

  const isPending = (q: TeacherQuestion) =>
    !q.validated_at && !q.rejected_at &&
    (q.is_ai_generated === true || q.origin === "extracted_from_pdf");
  const isRejectedQ = (q: TeacherQuestion) =>
    !!q.rejected_at && (q.is_ai_generated === true || q.origin === "extracted_from_pdf");

  const pendingQuestions = myQuestions.filter(isPending);
  const rejectedQuestions = myQuestions.filter(isRejectedQ);
  const validatedQuestionsBase = myQuestions.filter(
    (q) => !isPending(q) && !isRejectedQ(q)
  );

  const hasValidatedFilter =
    myFilterSubject !== null ||
    myFilterLevel !== null ||
    myFilterType !== "" ||
    myFilterPeriod !== "" ||
    myFilterOrigin !== "" ||
    filterStars !== 0;

  const filteredValidated = validatedQuestionsBase.filter((q) => {
    if (myFilterType && q.type !== myFilterType) return false;
    if (myFilterPeriod && q.period !== myFilterPeriod) return false;
    if (myFilterSubject !== null && q.subject_enum !== myFilterSubject) return false;
    if (myFilterLevel !== null && q.level !== myFilterLevel) return false;
    if (filterStars !== 0 && q.difficulty_stars !== filterStars) return false;
    if (myFilterOrigin !== "" && q.origin !== myFilterOrigin) return false;
    return true;
  });

  const sortedValidated = [...filteredValidated].sort((a, b) => {
    if (sortBy === "type") return a.type.localeCompare(b.type);
    if (sortBy === "period") return (a.period ?? "").localeCompare(b.period ?? "");
    return 0;
  });

  const filteredPublic = publicQuestions.filter((q) => {
    if (pubFilterType && q.type !== pubFilterType) return false;
    if (pubFilterPeriod && q.period !== pubFilterPeriod) return false;
    if (
      pubFilterText &&
      !q.question.toLowerCase().includes(pubFilterText.toLowerCase())
    )
      return false;
    return true;
  });

  const isBusy = validatingId !== null || rejectingId !== null;

  return {
    // guards
    isTeacher,
    pageLoading,
    // tabs
    tab, setTab,
    valTab, setValTab,
    // form
    showForm, setShowForm,
    form, setForm,
    saving,
    editingId,
    // my questions
    myQuestions,
    // filters
    myFilterType, setMyFilterType,
    myFilterPeriod, setMyFilterPeriod,
    myFilterSubject, setMyFilterSubject,
    myFilterLevel, setMyFilterLevel,
    myFilterOrigin, setMyFilterOrigin,
    sortBy, setSortBy,
    filterStars, setFilterStars,
    // validation
    fadingIds,
    validatingId,
    rejectingId,
    valToast,
    isBusy,
    // propose
    proposeStatuses,
    // pdf
    pdfLoading,
    pdfError,
    pdfWarning,
    pdfProgress,
    pdfStats,
    drafts, setDrafts,
    savingDrafts,
    pdfSubject, setPdfSubject,
    pdfLevel, setPdfLevel,
    generatingExplanation,
    // public library
    pubFilterType, setPubFilterType,
    pubFilterPeriod, setPubFilterPeriod,
    pubFilterText, setPubFilterText,
    addingId,
    // derived
    pendingQuestions,
    rejectedQuestions,
    validatedQuestionsBase,
    hasValidatedFilter,
    filteredValidated,
    sortedValidated,
    filteredPublic,
    // handlers
    resetForm,
    startEdit,
    saveQuestion,
    deleteQuestion,
    togglePublic,
    duplicateQuestion,
    generateExplanation,
    validateQuestion,
    rejectQuestion,
    callUnvalidate,
    updateQuestionDifficulty,
    proposeQuestion,
    handlePdfUpload,
    saveDrafts,
    addPublicQuestion,
  };
}
