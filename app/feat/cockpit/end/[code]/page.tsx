"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, HelpCircle, Layers, BookOpen } from "lucide-react";
import type { PostCourseDocType, PersonalizedAssignment } from "@/types/post-course";

type Tab = PostCourseDocType;

type DocState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; content: string }
  | { status: "error" };

type HomeworkState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; assignments: PersonalizedAssignment[] }
  | { status: "error" };

// Minimal markdown → safe HTML (static AI output only)
function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold mt-4 mb-1 text-stone-800">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-5 mb-2 text-stone-900">$1</h2>')
    .replace(/^---$/gm, '<hr class="my-3 border-stone-200">')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-stone-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (match) => `<ul class="space-y-0.5 my-1">${match}</ul>`)
    .replace(/\n\n/g, '<br class="my-2">')
    .replace(/\n/g, "<br>");
}

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode; desc: string }> = [
  { id: "summary",    label: "Résumé",      icon: <FileText size={16} />,   desc: "Synthèse du cours" },
  { id: "quiz",       label: "Quiz",        icon: <HelpCircle size={16} />, desc: "5 QCM à réviser" },
  { id: "flashcards", label: "Flashcards",  icon: <Layers size={16} />,     desc: "8 cartes mémo" },
  { id: "homework",   label: "Devoirs",     icon: <BookOpen size={16} />,   desc: "Personnalisés ×4" },
];

const STUDENT_LEVEL_COLOR: Record<string, string> = {
  avancé:   "bg-violet-100 text-violet-700",
  standard: "bg-blue-100 text-blue-700",
  basique:  "bg-emerald-100 text-emerald-700",
};

export default function EndPage() {
  const { code } = useParams<{ code: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [docs, setDocs] = useState<Partial<Record<Tab, DocState>>>({});
  const [homework, setHomework] = useState<HomeworkState>({ status: "idle" });

  async function loadTab(tab: Tab) {
    if (tab === "homework") {
      if (homework.status !== "idle") return;
      setHomework({ status: "loading" });
      try {
        const res = await fetch(`/api/feat/cockpit/sessions/${code}/post-course?type=homework`);
        if (!res.ok) { setHomework({ status: "error" }); return; }
        const json = await res.json();
        setHomework({ status: "done", assignments: json.assignments });
      } catch {
        setHomework({ status: "error" });
      }
      return;
    }

    if (docs[tab] && docs[tab]!.status !== "idle") return;
    setDocs((prev) => ({ ...prev, [tab]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/feat/cockpit/sessions/${code}/post-course?type=${tab}`);
      if (!res.ok) { setDocs((prev) => ({ ...prev, [tab]: { status: "error" } })); return; }
      const json = await res.json();
      setDocs((prev) => ({ ...prev, [tab]: { status: "done", content: json.doc.content } }));
    } catch {
      setDocs((prev) => ({ ...prev, [tab]: { status: "error" } }));
    }
  }

  // Auto-load summary on mount
  useEffect(() => { loadTab("summary"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    loadTab(tab);
  }

  const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  return (
    <main className="min-h-screen bg-stone-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-5 pt-8 pb-5">
        <div className="mx-auto max-w-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-1">
            Post-cours
          </p>
          <h1 className="font-serif text-2xl font-bold text-stone-900 leading-tight">
            C'est dans la boîte.
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Maia a préparé tes livrables pendant que tu enseignais.
          </p>
          <p className="mt-2 font-mono text-xs text-stone-400">#{code.toUpperCase()}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-5">
        <div className="mx-auto max-w-lg">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-none">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  activeTab === tab.id
                    ? "bg-violet-100 text-violet-700"
                    : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-lg px-5 pt-5">
        {activeTab !== "homework" ? (
          (() => {
            const state = docs[activeTab] ?? { status: "idle" };
            if (state.status === "loading" || state.status === "idle") {
              return (
                <motion.div {...fadeUp} className="space-y-3">
                  {[90, 70, 85, 60, 75, 50].map((w, i) => (
                    <div
                      key={i}
                      className="h-4 animate-pulse rounded-full bg-stone-200"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                  <p className="text-xs text-stone-400 text-center pt-2">
                    Maia génère…
                  </p>
                </motion.div>
              );
            }
            if (state.status === "error") {
              return (
                <p className="text-sm text-red-500 italic">
                  Génération indisponible pour le moment.
                </p>
              );
            }
            return (
              <motion.div
                key={activeTab}
                {...fadeUp}
                className="rounded-2xl bg-white border border-stone-100 p-5 shadow-sm"
              >
                <div
                  className="text-sm text-stone-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: mdToHtml(state.content) }}
                />
              </motion.div>
            );
          })()
        ) : (
          (() => {
            if (homework.status === "loading" || homework.status === "idle") {
              return (
                <motion.div {...fadeUp} className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-2xl bg-white border border-stone-100 p-5 animate-pulse">
                      <div className="h-3 w-28 rounded-full bg-stone-100 mb-3" />
                      <div className="space-y-2">
                        <div className="h-3 w-full rounded-full bg-stone-100" />
                        <div className="h-3 w-4/5 rounded-full bg-stone-100" />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-stone-400 text-center pt-1">
                    Maia personnalise pour chaque élève…
                  </p>
                </motion.div>
              );
            }
            if (homework.status === "error") {
              return (
                <p className="text-sm text-red-500 italic">
                  Génération des devoirs indisponible.
                </p>
              );
            }
            return (
              <motion.div
                {...fadeUp}
                className="space-y-4"
              >
                {homework.assignments.map((a) => (
                  <div
                    key={a.student.id}
                    className="rounded-2xl bg-white border border-stone-100 p-5 shadow-sm"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xl">{a.student.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-800">{a.student.name}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STUDENT_LEVEL_COLOR[a.student.level]}`}>
                        {a.student.level}
                      </span>
                    </div>
                    <div
                      className="text-sm text-stone-700 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: mdToHtml(a.assignment) }}
                    />
                  </div>
                ))}
              </motion.div>
            );
          })()
        )}

        {/* CTA */}
        <div className="mt-8 text-center">
          <a
            href="/feat/cockpit"
            className="text-sm text-stone-400 hover:text-violet-600 transition-colors underline-offset-2 hover:underline"
          >
            Retour au cockpit
          </a>
        </div>
      </div>
    </main>
  );
}
