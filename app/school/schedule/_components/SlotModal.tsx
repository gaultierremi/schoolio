"use client";

import { useState, useEffect } from "react";

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
  "#64748b", // slate
];

const DAYS = [
  { label: "Lundi", value: 1 },
  { label: "Mardi", value: 2 },
  { label: "Mercredi", value: 3 },
  { label: "Jeudi", value: 4 },
  { label: "Vendredi", value: 5 },
  { label: "Samedi", value: 6 },
  { label: "Dimanche", value: 0 },
];

type ClassOption = { id: string; name: string; subject: string | null };

type Slot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: string;
  class_id: string | null;
  subject_label: string | null;
  custom_color: string | null;
  notes: string | null;
};

type Props = {
  slot: Slot | null;
  defaultDay?: number;
  defaultTime?: string;
  classes: ClassOption[];
  onClose: () => void;
  onSaved: () => void;
};

export function SlotModal({ slot, defaultDay, defaultTime, classes, onClose, onSaved }: Props) {
  const isEdit = slot !== null;

  // Une "séance" = un triplet (day_of_week, start_time, end_time).
  // En mode création, on supporte 1-N séances pour la même classe, créées
  // d'un seul submit. En mode édition, toujours 1 (la séance courante).
  type SessionRow = { day_of_week: number; start_time: string; end_time: string };

  const defaultEndTime = (st: string) => {
    const [h, m] = st.split(":").map(Number);
    const endMin = h * 60 + m + 60;
    return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  };

  const initialStart = slot?.start_time?.slice(0, 5) ?? defaultTime ?? "08:00";
  const initialEnd = slot?.end_time?.slice(0, 5) ?? defaultEndTime(initialStart);

  const [sessions, setSessions] = useState<SessionRow[]>([{
    day_of_week: slot?.day_of_week ?? defaultDay ?? 1,
    start_time: initialStart,
    end_time: initialEnd,
  }]);

  const [weekPattern, setWeekPattern] = useState<"all" | "A" | "B">(
    (slot?.week_pattern as "all" | "A" | "B") ?? "all"
  );
  const [useClass, setUseClass] = useState(slot ? slot.class_id !== null : classes.length > 0);
  const [classId, setClassId] = useState(slot?.class_id ?? (classes[0]?.id ?? ""));
  const [subjectLabel, setSubjectLabel] = useState(slot?.subject_label ?? "");
  const [color, setColor] = useState(slot?.custom_color ?? COLORS[0]);
  const [notes, setNotes] = useState(slot?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ ok: number; conflicts: number; errors: number } | null>(null);

  function updateSession(idx: number, patch: Partial<SessionRow>) {
    setSessions((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addSession() {
    setSessions((prev) => {
      const last = prev[prev.length - 1];
      // Auto-pick "lendemain" pour éviter conflit avec le précédent
      return [...prev, { day_of_week: (last.day_of_week + 1) % 7, start_time: last.start_time, end_time: last.end_time }];
    });
  }
  function removeSession(idx: number) {
    setSessions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setResults(null);

    const sharedBody = {
      week_pattern: weekPattern,
      class_id: useClass && classId ? classId : null,
      subject_label: !useClass && subjectLabel.trim() ? subjectLabel.trim() : null,
      custom_color: color,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit) {
        // Mode édition : on n'édite qu'une seule séance (la 1ère).
        const s = sessions[0];
        const res = await fetch(`/api/school/schedule/${slot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sharedBody, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        onSaved();
        return;
      }

      // Mode création : on POST chaque séance, agrégat des résultats.
      let ok = 0;
      let conflicts = 0;
      let errors = 0;
      const errMsgs: string[] = [];
      for (const s of sessions) {
        const res = await fetch("/api/school/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sharedBody, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time }),
        });
        if (res.ok) {
          ok++;
        } else if (res.status === 409) {
          conflicts++;
        } else {
          errors++;
          const data = await res.json().catch(() => ({} as { error?: string }));
          if (data.error && !errMsgs.includes(data.error)) errMsgs.push(data.error);
        }
      }

      setResults({ ok, conflicts, errors });

      if (ok === sessions.length) {
        // Tout passe → ferme + refresh
        onSaved();
      } else if (ok > 0) {
        // Partial → garde le modal ouvert pour montrer les résultats, refresh la grille
        onSaved();
        if (errMsgs.length > 0) setError(errMsgs[0]);
      } else {
        // Aucun succès
        setError(errMsgs[0] ?? (conflicts === sessions.length ? "Tous les créneaux chevauchent l'existant" : "Erreur"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/school/schedule/${slot.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Erreur");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-white mb-4">
          {isEdit ? "Modifier le créneau" : "Ajouter un créneau"}
        </h2>

        <div className="space-y-4">
          {/* Sessions : 1 ou plusieurs (uniquement en création) */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label className="text-xs text-gray-400">
                {isEdit ? "Créneau" : sessions.length > 1 ? `Séances (${sessions.length})` : "Séance"}
              </label>
              {!isEdit && (
                <button
                  type="button"
                  onClick={addSession}
                  className="text-xs font-bold text-indigo-400 transition hover:text-indigo-300"
                >
                  + Ajouter une séance
                </button>
              )}
            </div>
            {sessions.map((s, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  {idx === 0 && <label className="block text-[10px] text-gray-500 mb-0.5">Jour</label>}
                  <select
                    value={s.day_of_week}
                    onChange={(e) => updateSession(idx, { day_of_week: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                  >
                    {DAYS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  {idx === 0 && <label className="block text-[10px] text-gray-500 mb-0.5">Début</label>}
                  <input
                    type="time"
                    value={s.start_time}
                    onChange={(e) => updateSession(idx, { start_time: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div className="w-24">
                  {idx === 0 && <label className="block text-[10px] text-gray-500 mb-0.5">Fin</label>}
                  <input
                    type="time"
                    value={s.end_time}
                    onChange={(e) => updateSession(idx, { end_time: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                  />
                </div>
                {!isEdit && sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSession(idx)}
                    aria-label="Retirer cette séance"
                    className="h-[34px] w-7 flex items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-900/30 hover:text-red-400"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Week pattern */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Semaine</label>
            <div className="flex gap-2">
              {(["all", "A", "B"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setWeekPattern(p)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${weekPattern === p ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                >
                  {p === "all" ? "Toutes" : `Sem. ${p}`}
                </button>
              ))}
            </div>
          </div>

          {/* Class or label */}
          <div>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setUseClass(true)}
                className={`flex-1 py-1 rounded text-xs font-medium ${useClass ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400"}`}
              >
                Classe
              </button>
              <button
                onClick={() => setUseClass(false)}
                className={`flex-1 py-1 rounded text-xs font-medium ${!useClass ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400"}`}
              >
                Intitulé libre
              </button>
            </div>
            {useClass ? (
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              >
                {classes.length === 0 && <option value="">Aucune classe</option>}
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={subjectLabel}
                onChange={(e) => setSubjectLabel(e.target.value)}
                placeholder="Ex : Mathématiques 4e"
                maxLength={80}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500"
              />
            )}
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Couleur</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: c, outline: color === c ? `2px solid white` : "none", outlineOffset: 2 }}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 resize-none"
              placeholder="Salle, matériel, rappel…"
            />
          </div>
        </div>

        {results && (results.conflicts > 0 || results.errors > 0) && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {results.ok} créée{results.ok !== 1 ? "s" : ""}
            {results.conflicts > 0 && ` · ${results.conflicts} en conflit avec l'existant`}
            {results.errors > 0 && ` · ${results.errors} erreur${results.errors !== 1 ? "s" : ""}`}
          </div>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-2 mt-5">
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-900/40 text-red-400 hover:bg-red-900/60 disabled:opacity-50 transition-colors"
            >
              {deleting ? "…" : "Supprimer"}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {saving ? "…" : isEdit ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
