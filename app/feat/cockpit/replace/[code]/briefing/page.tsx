"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Users, FileText, Lightbulb } from "lucide-react";
import { DEMO_PDFS } from "@/lib/cockpit/session";
import { MOCK_STUDENTS } from "@/types/post-course";

type AbsenceData = {
  titulaire_name: string;
  replacement_name: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

const LEVEL_COLOR: Record<string, string> = {
  avancé: "bg-violet-100 text-violet-700",
  standard: "bg-blue-100 text-blue-700",
  basique: "bg-emerald-100 text-emerald-700",
};

const MOCK_SCHEDULE = [
  { time: "08h30 – 10h00", subject: DEMO_PDFS[0].title, detail: DEMO_PDFS[0].subject, pages: "p. 14 → 22" },
  { time: "13h30 – 15h00", subject: DEMO_PDFS[1].title, detail: DEMO_PDFS[1].subject, pages: "p. 5 → 12" },
];

// Minimal markdown → safe HTML (no user-generated content reaches this function)
function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-4 mb-1 text-stone-800">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, '<br class="my-2">')
    .replace(/\n/g, "<br>");
}

export default function BriefingPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [absence, setAbsence] = useState<AbsenceData | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [absRes, briefRes] = await Promise.all([
          fetch(`/api/feat/cockpit/absence?code=${code}`),
          fetch(`/api/feat/cockpit/replace/${code}/briefing`),
        ]);
        if (absRes.ok) setAbsence(await absRes.json());
        if (briefRes.ok) {
          const data = await briefRes.json();
          setBriefing(data.briefing);
        } else {
          setError("Impossible de générer le briefing. Contacte la direction.");
        }
      } catch {
        setError("Réseau indisponible.");
      } finally {
        setLoadingBriefing(false);
      }
    }
    load();
  }, [code]);

  async function handleStartCourse() {
    // Create a replacement session with first demo PDF
    const res = await fetch("/api/feat/cockpit/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf_key: "demo-1", is_replacement: true, replacement_code: code }),
    });
    const json = await res.json();
    if (res.ok) {
      router.push(`/feat/cockpit/session/${json.code}`);
    }
  }

  const staggerContainer = {
    animate: { transition: { staggerChildren: 0.08 } },
  };
  const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  };

  return (
    <main className="min-h-screen bg-stone-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-5 pt-8 pb-6">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-1">Briefing Maia</p>
          <h1 className="font-serif text-2xl font-bold text-stone-900 leading-tight">
            Tu remplaces {absence?.titulaire_name ?? "le prof titulaire"} aujourd'hui
          </h1>
          {absence?.start_date && (
            <p className="mt-1 text-sm text-stone-500">
              {new Date(absence.start_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-lg px-5 pt-6">
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">

          {/* Section 1 — Briefing IA */}
          <motion.section variants={fadeUp} className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-100">
              <Lightbulb size={16} className="text-violet-500" />
              <h2 className="text-sm font-semibold text-stone-800">Ce que Maia a préparé pour toi</h2>
            </div>
            <div className="px-4 py-4">
              {loadingBriefing ? (
                <div className="space-y-2.5 animate-pulse">
                  {[80, 65, 90, 55, 75].map((w, i) => (
                    <div key={i} className="h-3.5 rounded-full bg-stone-100" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : error ? (
                <p className="text-sm text-red-500 italic">{error}</p>
              ) : briefing ? (
                <div
                  className="text-sm text-stone-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: mdToHtml(briefing) }}
                />
              ) : null}
            </div>
          </motion.section>

          {/* Section 2 — Plan de la journée */}
          <motion.section variants={fadeUp} className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-100">
              <BookOpen size={16} className="text-blue-500" />
              <h2 className="text-sm font-semibold text-stone-800">Plan de la journée</h2>
            </div>
            <div className="divide-y divide-stone-50">
              {MOCK_SCHEDULE.map((slot) => (
                <div key={slot.time} className="px-4 py-3 flex items-start gap-3">
                  <div className="shrink-0 text-xs font-mono text-stone-400 mt-0.5 w-24">{slot.time}</div>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{slot.subject}</p>
                    <p className="text-xs text-stone-500">{slot.detail} — <span className="font-medium">{slot.pages}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Section 3 — Élèves */}
          <motion.section variants={fadeUp} className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-100">
              <Users size={16} className="text-amber-500" />
              <h2 className="text-sm font-semibold text-stone-800">Élèves à connaître</h2>
            </div>
            <div className="divide-y divide-stone-50">
              {MOCK_STUDENTS.map((student) => (
                <div key={student.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">{student.avatar}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-800">{student.name}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${LEVEL_COLOR[student.level]}`}>
                    {student.level}
                  </span>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Section 4 — Notes du titulaire */}
          {absence?.notes && (
            <motion.section variants={fadeUp} className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={15} className="text-amber-600" />
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Note du titulaire</p>
              </div>
              <p className="text-sm italic text-stone-700 leading-relaxed">"{absence.notes}"</p>
            </motion.section>
          )}

          {/* CTA Démarrer */}
          <motion.div variants={fadeUp} className="pt-2">
            <button
              onClick={handleStartCourse}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-semibold text-white hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/20"
            >
              Démarrer le cours
              <ArrowRight size={18} />
            </button>
            <p className="mt-3 text-center text-xs text-stone-400">
              Le cours sera tagué "remplacement" dans le journal de classe.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
