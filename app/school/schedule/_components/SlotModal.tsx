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

  const [dayOfWeek, setDayOfWeek] = useState(slot?.day_of_week ?? defaultDay ?? 1);
  const [startTime, setStartTime] = useState(slot?.start_time?.slice(0, 5) ?? defaultTime ?? "08:00");
  const [endTime, setEndTime] = useState(() => {
    if (slot?.end_time) return slot.end_time.slice(0, 5);
    if (defaultTime) {
      const [h, m] = defaultTime.split(":").map(Number);
      const endMin = h * 60 + m + 60;
      return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    }
    return "09:00";
  });
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
    const body = {
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      week_pattern: weekPattern,
      class_id: useClass && classId ? classId : null,
      subject_label: !useClass && subjectLabel.trim() ? subjectLabel.trim() : null,
      custom_color: color,
      notes: notes.trim() || null,
    };
    try {
      const url = isEdit ? `/api/school/schedule/${slot.id}` : "/api/school/schedule";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      onSaved();
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
          {/* Day */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Jour</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Times */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Début</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
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
