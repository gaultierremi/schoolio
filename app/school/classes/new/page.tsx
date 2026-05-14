"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS, LEVELS, FWB_SECONDARY_SUBJECT_IDS } from "@/lib/subjects";

type Cohorte = { id: string; name: string; level: string | null };

const FWB_SUBJECTS = SUBJECTS.filter((s) => (FWB_SECONDARY_SUBJECT_IDS as readonly string[]).includes(s.id));

export default function NewClassPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [type, setType] = useState<"cohorte" | "subject_class">("cohorte");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [parentClassId, setParentClassId] = useState<string>("");
  const [cohortes, setCohortes] = useState<Cohorte[]>([]);
  const [loadingCohortes, setLoadingCohortes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge les cohortes existantes quand l'utilisateur switch sur "sous-classe matière"
  useEffect(() => {
    if (type !== "subject_class") return;
    async function load() {
      setLoadingCohortes(true);
      try {
        const res = await fetch("/api/classes");
        if (!res.ok) return;
        const data = (await res.json()) as { classes?: Array<Cohorte & { parent_class_id: string | null; archived_at: string | null }> };
        const onlyCohortes = (data.classes ?? []).filter((c) => !c.parent_class_id && !c.archived_at);
        setCohortes(onlyCohortes.map((c) => ({ id: c.id, name: c.name, level: c.level })));
      } finally {
        setLoadingCohortes(false);
      }
    }
    load();
  }, [type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setError("Le nom doit contenir entre 2 et 80 caractères.");
      return;
    }
    if (type === "subject_class") {
      if (!parentClassId) { setError("Choisis une cohorte parente."); return; }
      if (!subject) { setError("La matière est requise pour une sous-classe."); return; }
    }

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/"); return; }

    const res = await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        level: level || null,
        subject: type === "subject_class" ? subject : (subject || null),
        parent_class_id: type === "subject_class" ? parentClassId : null,
      }),
    });

    const json = await res.json() as { class?: { id: string }; error?: string };
    if (!res.ok || !json.class) {
      setError(json.error ?? "Erreur lors de la création.");
      setSubmitting(false);
      return;
    }

    router.push(`/school/classes/${json.class.id}`);
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto w-full max-w-lg">

        <a href="/school/classes" className="text-xs text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]">
          ← Mes classes
        </a>
        <h1 className="serif mt-2 text-3xl font-black text-[rgb(var(--ink))]">Nouvelle classe</h1>
        <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
          Une cohorte regroupe les élèves d&apos;une année (ex : 4ème D). Une sous-classe matière
          vit à l&apos;intérieur (ex : 4D Maths) et contient le syllabus, les chapitres et les résultats.
        </p>

        {/* Type toggle */}
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
          <button
            type="button"
            onClick={() => setType("cohorte")}
            className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              type === "cohorte"
                ? "bg-[rgb(var(--accent))] text-white"
                : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
            }`}
          >
            Cohorte (4ème D)
          </button>
          <button
            type="button"
            onClick={() => setType("subject_class")}
            className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              type === "subject_class"
                ? "bg-[rgb(var(--accent))] text-white"
                : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
            }`}
          >
            Sous-classe matière (4D Maths)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Nom */}
          <div>
            <label className="block text-sm font-bold text-[rgb(var(--ink-2))]">
              Nom <span className="text-[rgb(var(--red))]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "cohorte" ? "ex : 4ème D" : "ex : 4D Maths"}
              maxLength={80}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--ink))] outline-none transition placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30 disabled:opacity-50"
            />
          </div>

          {/* Cohorte parente — sous-classe uniquement */}
          {type === "subject_class" && (
            <div>
              <label className="block text-sm font-bold text-[rgb(var(--ink-2))]">
                Cohorte parente <span className="text-[rgb(var(--red))]">*</span>
              </label>
              <select
                value={parentClassId}
                onChange={(e) => setParentClassId(e.target.value)}
                disabled={submitting || loadingCohortes}
                className="mt-2 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--ink))] outline-none transition focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30 disabled:opacity-50"
              >
                <option value="">
                  {loadingCohortes ? "Chargement…" : cohortes.length === 0 ? "Aucune cohorte — crée d'abord une cohorte" : "Choisir une cohorte"}
                </option>
                {cohortes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.level ? ` · ${c.level}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Niveau */}
          <div>
            <label className="block text-sm font-bold text-[rgb(var(--ink-2))]">Niveau</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--ink))] outline-none transition focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30 disabled:opacity-50"
            >
              <option value="">Tous niveaux</option>
              {LEVELS.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Matière */}
          <div>
            <label className="block text-sm font-bold text-[rgb(var(--ink-2))]">
              Matière {type === "subject_class" && <span className="text-[rgb(var(--red))]">*</span>}
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--ink))] outline-none transition focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30 disabled:opacity-50"
            >
              <option value="">{type === "cohorte" ? "Toutes matières (cohorte)" : "Choisir une matière"}</option>
              {FWB_SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 px-4 py-3 text-sm font-bold text-[rgb(var(--red))]">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-[rgb(var(--accent))] px-5 py-3.5 font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Création…" : type === "cohorte" ? "Créer la cohorte" : "Créer la sous-classe"}
          </button>
        </form>
      </div>
    </main>
  );
}
