"use client";

import { useMemo, useState } from "react";
import { BLANK_FORM } from "./_types";
import { useQuestionsPage } from "./_hooks/useQuestionsPage";
import { FilterBar } from "./_components/FilterBar";
import { QuestionForm } from "./_components/QuestionForm";
import { SubjectLevelSelector } from "./_components/SubjectLevelSelector";
import { PdfUploadZone } from "./_components/PdfUploadZone";
import { DraftCard } from "./_components/DraftCard";
import { PendingCard } from "./_components/PendingCard";
import { ValidatedCard } from "./_components/ValidatedCard";
import { RejectedCard } from "./_components/RejectedCard";
import { TypeBadge } from "./_components/TypeBadge";
import { SubjectSidebar, type QuestionTypeFilter } from "./_components/SubjectSidebar";

export default function SchoolQuestionsPage() {
  const {
    isTeacher, pageLoading,
    tab, setTab,
    valTab, setValTab,
    showForm, setShowForm,
    form, setForm,
    saving, editingId,
    myQuestions,
    myFilterType, setMyFilterType,
    myFilterPeriod, setMyFilterPeriod,
    myFilterSubject, setMyFilterSubject,
    myFilterLevel, setMyFilterLevel,
    myFilterOrigin, setMyFilterOrigin,
    sortBy, setSortBy,
    filterStars, setFilterStars,
    fadingIds, validatingId, rejectingId,
    valToast, isBusy,
    proposeStatuses,
    pdfLoading, pdfError, pdfWarning, pdfProgress, pdfStats,
    drafts, setDrafts,
    savingDrafts,
    pdfSubject, setPdfSubject,
    pdfLevel, setPdfLevel,
    generatingExplanation,
    pubFilterType, setPubFilterType,
    pubFilterPeriod, setPubFilterPeriod,
    pubFilterText, setPubFilterText,
    addingId,
    pendingQuestions, rejectedQuestions, validatedQuestionsBase,
    hasValidatedFilter, filteredValidated, sortedValidated, filteredPublic,
    resetForm, startEdit, saveQuestion, deleteQuestion,
    togglePublic, duplicateQuestion, generateExplanation,
    validateQuestion, rejectQuestion, callUnvalidate, updateQuestionDifficulty, proposeQuestion,
    handlePdfUpload, saveDrafts, addPublicQuestion,
  } = useQuestionsPage();

  // Filtre sidebar matière + thème + type, scoped à l'onglet "à valider".
  // Permet de naviguer dans des centaines de questions sur gros syllabus, et
  // de valider par batch d'un même type (ex: tous les QCM d'un chapitre).
  const [pendingSubjectFilter, setPendingSubjectFilter] = useState<string | null>(null);
  const [pendingThemeFilter, setPendingThemeFilter] = useState<string | null>(null);
  const [pendingTypeFilter, setPendingTypeFilter] = useState<QuestionTypeFilter>("all");
  const filteredPendingBySubject = useMemo(() => {
    return pendingQuestions.filter((q) => {
      if (pendingSubjectFilter !== null) {
        const s = (q.subject_enum ?? q.subject ?? "autre") as string;
        if (s !== pendingSubjectFilter) return false;
      }
      if (pendingThemeFilter !== null) {
        if ((q.period ?? "").trim() !== pendingThemeFilter) return false;
      }
      if (pendingTypeFilter !== "all") {
        const qt = q.type as string | null | undefined;
        // "truefalse" est legacy mais visuellement traité comme un QCM 2 options.
        const normalized = qt === "truefalse" ? "mcq" : qt;
        if (normalized !== pendingTypeFilter) return false;
      }
      return true;
    });
  }, [pendingQuestions, pendingSubjectFilter, pendingThemeFilter, pendingTypeFilter]);

  // ── Guards ──

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] p-8 text-[rgb(var(--ink))]">
        Chargement...
      </main>
    );
  }

  if (!isTeacher) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] p-8 text-[rgb(var(--ink))]">
        <div className="mx-auto max-w-xl rounded-3xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-6">
          <h1 className="text-2xl font-black text-[rgb(var(--red))]">Accès refusé</h1>
          <p className="mt-2 text-[rgb(var(--ink-2))]">
            Cet espace est réservé aux professeurs autorisés.
          </p>
        </div>
      </main>
    );
  }

  // ── Render ──

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-4xl">
        <a
          href="/school"
          className="text-sm font-bold text-[rgb(var(--ink-3))] transition hover:text-[rgb(var(--accent))]"
        >
          ← Espace professeur
        </a>

        <h1 className="mt-4 text-4xl font-black">Mes questions</h1>
        <p className="mt-2 text-[rgb(var(--ink-2))]">
          Crée, importe depuis un PDF et gère tes questions de quiz.
        </p>

        {/* Outer tabs */}
        <div className="mt-6 flex gap-1 border-b border-[rgb(var(--border))]">
          {(
            [
              { key: "my", label: `Mes questions (${myQuestions.length})` },
              { key: "pdf", label: "Importer PDF" },
              { key: "public", label: "Bibliothèque HistoGuess" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-t-xl px-4 py-3 text-sm font-black transition ${
                tab === key
                  ? "bg-[rgb(var(--surface))] text-[rgb(var(--accent))]"
                  : "text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {/* ── My questions ── */}
          {tab === "my" && (
            <div>
              {showForm ? (
                <QuestionForm
                  form={form}
                  setForm={setForm}
                  onSave={saveQuestion}
                  onCancel={resetForm}
                  saving={saving}
                  isEdit={!!editingId}
                  generatingExpl={generatingExplanation}
                  onGenerateExpl={generateExplanation}
                />
              ) : (
                <button
                  onClick={() => {
                    setForm({ ...BLANK_FORM });
                    setShowForm(true);
                  }}
                  className="mb-6 rounded-2xl bg-[rgb(var(--accent))] px-5 py-3 font-black text-white transition hover:opacity-90"
                >
                  + Nouvelle question
                </button>
              )}

              {/* Inner val tabs */}
              <div className="flex gap-1 border-b border-[rgb(var(--border))] mb-5">
                <button
                  onClick={() => setValTab("pending")}
                  className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-black transition ${
                    valTab === "pending"
                      ? "bg-[rgb(var(--surface))] text-[rgb(var(--accent))]"
                      : "text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                  }`}
                >
                  À valider
                  {pendingQuestions.length > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[rgb(var(--warm))] px-1 text-[10px] font-black text-white">
                      {pendingQuestions.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setValTab("validated")}
                  className={`rounded-t-xl px-4 py-3 text-sm font-black transition ${
                    valTab === "validated"
                      ? "bg-[rgb(var(--surface))] text-[rgb(var(--accent))]"
                      : "text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                  }`}
                >
                  Validées ({validatedQuestionsBase.length})
                </button>
                <button
                  onClick={() => setValTab("rejected")}
                  className={`rounded-t-xl px-4 py-3 text-sm font-black transition ${
                    valTab === "rejected"
                      ? "bg-[rgb(var(--surface))] text-[rgb(var(--accent))]"
                      : "text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                  }`}
                >
                  Rejetées
                  {rejectedQuestions.length > 0 && (
                    <span className="ml-2 text-[rgb(var(--ink-3))]">({rejectedQuestions.length})</span>
                  )}
                </button>
              </div>

              {/* ── Pending tab ── */}
              {valTab === "pending" && (
                <div>
                  {pendingQuestions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-10 text-center text-[rgb(var(--ink-3))]">
                      Aucune question générée par Maïa en attente de validation.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6 lg:flex-row">
                      <SubjectSidebar
                        questions={pendingQuestions}
                        selectedSubject={pendingSubjectFilter}
                        selectedTheme={pendingThemeFilter}
                        selectedType={pendingTypeFilter}
                        onSelectSubject={(s) => {
                          setPendingSubjectFilter(s);
                          // Reset theme quand on change de matière (les thèmes diffèrent)
                          setPendingThemeFilter(null);
                        }}
                        onSelectTheme={setPendingThemeFilter}
                        onSelectType={setPendingTypeFilter}
                      />
                      <div className="flex-1 space-y-4 min-w-0">
                        {filteredPendingBySubject.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-8 text-center text-sm text-[rgb(var(--ink-3))]">
                            Aucune question pour cette matière.
                          </div>
                        ) : (
                          filteredPendingBySubject
                            .filter((q) => !(editingId === q.id && showForm))
                            .map((q) => (
                              <PendingCard
                                key={q.id}
                                q={q}
                                isFading={fadingIds.has(q.id)}
                                isValidating={validatingId === q.id}
                                isRejecting={rejectingId === q.id}
                                isBusy={isBusy}
                                onDifficultyChange={(v) =>
                                  updateQuestionDifficulty(q.id, v)
                                }
                                onValidate={() => validateQuestion(q.id)}
                                onReject={() => rejectQuestion(q.id)}
                                onEdit={() => startEdit(q)}
                              />
                            ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Validated tab ── */}
              {valTab === "validated" && (
                <div>
                  {/* Filters */}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <FilterBar
                      filterType={myFilterType}
                      setFilterType={setMyFilterType}
                      filterPeriod={myFilterPeriod}
                      setFilterPeriod={setMyFilterPeriod}
                      filterOrigin={myFilterOrigin}
                      setFilterOrigin={setMyFilterOrigin}
                    />
                    <select
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(e.target.value as "date" | "type" | "period")
                      }
                      className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
                    >
                      <option value="date">Trier par date</option>
                      <option value="type">Trier par type</option>
                      <option value="period">Trier par période</option>
                    </select>
                  </div>

                  {/* Star filter */}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[rgb(var(--ink-3))]">Difficulté :</span>
                    {([0, 1, 2, 3] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setFilterStars(s)}
                        className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                          filterStars === s
                            ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                            : "border border-[rgb(var(--border))] text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                        }`}
                      >
                        {s === 0 ? "Toutes" : "★".repeat(s)}
                      </button>
                    ))}
                  </div>

                  {/* Subject/level filter */}
                  <div className="mb-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[rgb(var(--ink))]">
                          {validatedQuestionsBase.length} question
                          {validatedQuestionsBase.length > 1 ? "s" : ""} validée
                          {validatedQuestionsBase.length > 1 ? "s" : ""}
                        </p>
                        {hasValidatedFilter && (
                          <p className="mt-1 text-xs font-bold text-[rgb(var(--accent))]">
                            {filteredValidated.length} résultat
                            {filteredValidated.length > 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      {hasValidatedFilter && (
                        <button
                          type="button"
                          onClick={() => {
                            setMyFilterType("");
                            setMyFilterPeriod("");
                            setMyFilterSubject(null);
                            setMyFilterLevel(null);
                            setMyFilterOrigin("");
                            setFilterStars(0);
                          }}
                          className="rounded-xl border border-[rgb(var(--border))] px-3 py-2 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--accent))]/50 hover:text-[rgb(var(--accent))]"
                        >
                          Réinitialiser
                        </button>
                      )}
                    </div>
                    <SubjectLevelSelector
                      subjectId={myFilterSubject}
                      level={myFilterLevel}
                      onSubjectChange={setMyFilterSubject}
                      onLevelChange={setMyFilterLevel}
                      allowAllSubjects
                    />
                  </div>

                  {sortedValidated.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-10 text-center text-[rgb(var(--ink-3))]">
                      {validatedQuestionsBase.length === 0
                        ? "Aucune question validée. Valide des questions générées par Maïa ou crée-en une."
                        : "Aucun résultat pour ces filtres."}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortedValidated
                        .filter((q) => !(editingId === q.id && showForm))
                        .map((q) => (
                          <ValidatedCard
                            key={q.id}
                            q={q}
                            proposeState={proposeStatuses[q.id] ?? { kind: "idle" }}
                            onEdit={() => startEdit(q)}
                            onDelete={() => deleteQuestion(q.id)}
                            onTogglePublic={() => togglePublic(q)}
                            onDuplicate={() => duplicateQuestion(q)}
                            onUnvalidate={() => callUnvalidate(q.id)}
                            onPropose={() => proposeQuestion(q.id)}
                            onForcePropose={() => proposeQuestion(q.id, true)}
                            onDifficultyChange={(v) =>
                              updateQuestionDifficulty(q.id, v)
                            }
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Rejected tab ── */}
              {valTab === "rejected" && (
                <div>
                  {rejectedQuestions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-10 text-center text-[rgb(var(--ink-3))]">
                      Aucune question rejetée.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rejectedQuestions.map((q) => (
                        <RejectedCard
                          key={q.id}
                          q={q}
                          onRestore={() => callUnvalidate(q.id)}
                          onDelete={() => deleteQuestion(q.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PDF import ── */}
          {tab === "pdf" && (
            <div>
              {drafts.length === 0 ? (
                <div className="space-y-4">
                  <SubjectLevelSelector
                    subjectId={pdfSubject}
                    level={pdfLevel}
                    onSubjectChange={(id) => {
                      if (id) setPdfSubject(id);
                    }}
                    onLevelChange={setPdfLevel}
                  />
                  <PdfUploadZone
                    loading={pdfLoading}
                    error={pdfError}
                    warning={pdfWarning}
                    progress={pdfProgress}
                    pdfStats={pdfStats}
                    onFile={handlePdfUpload}
                  />
                </div>
              ) : (
                <div>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-black text-[rgb(var(--ink))]">
                      {drafts.filter((d) => d.kept).length} /{" "}
                      {drafts.length} question(s) sélectionnée(s)
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setDrafts([]);
                        }}
                        className="rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-bold text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
                      >
                        Recommencer
                      </button>
                      <button
                        onClick={saveDrafts}
                        disabled={
                          savingDrafts || drafts.filter((d) => d.kept).length === 0
                        }
                        className="rounded-xl bg-[rgb(var(--green))] px-5 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-40"
                      >
                        {savingDrafts ? "Sauvegarde..." : "Tout valider →"}
                      </button>
                    </div>
                  </div>

                  {pdfStats && (
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
                      {pdfStats.fromCache && (
                        <span className="rounded-full bg-[rgb(var(--green))]/10 px-3 py-1 text-xs font-black text-[rgb(var(--green))]">
                          ✓ Questions récupérées depuis le cache
                        </span>
                      )}
                      {pdfStats.pageCount !== null && (
                        <span className="text-sm text-[rgb(var(--ink-2))]">
                          {pdfStats.pageCount} page(s) analysée(s)
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    {drafts.map((draft, idx) => (
                      <DraftCard
                        key={draft.key}
                        draft={draft}
                        onChange={(updated) =>
                          setDrafts((prev) =>
                            prev.map((d, i) => (i === idx ? updated : d))
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Public library ── */}
          {tab === "public" && (
            <div>
              <div className="mb-5">
                <FilterBar
                  filterType={pubFilterType}
                  setFilterType={setPubFilterType}
                  filterPeriod={pubFilterPeriod}
                  setFilterPeriod={setPubFilterPeriod}
                  filterText={pubFilterText}
                  setFilterText={setPubFilterText}
                  showText
                />
              </div>

              <p className="mb-4 text-sm text-[rgb(var(--ink-3))]">
                {filteredPublic.length} question(s) approuvée(s) HistoGuess
              </p>

              <div className="space-y-2">
                {filteredPublic.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeBadge type={q.type} />
                        {q.period && (
                          <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">
                            {q.period}
                          </span>
                        )}
                        {q.difficulty && (
                          <span className="text-xs text-[rgb(var(--ink-3))]">
                            Difficulté {q.difficulty}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-bold text-[rgb(var(--ink))]">
                        {q.question}
                      </p>
                    </div>
                    <button
                      onClick={() => addPublicQuestion(q)}
                      disabled={addingId === q.id}
                      className="shrink-0 rounded-xl bg-[rgb(var(--accent))]/15 px-3 py-2 text-xs font-black text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent))]/25 disabled:opacity-40"
                    >
                      {addingId === q.id ? "..." : "+ Ajouter"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {valToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-[rgb(var(--green))] px-6 py-3 font-black text-white shadow-lg">
          {valToast}
        </div>
      )}
    </main>
  );
}
