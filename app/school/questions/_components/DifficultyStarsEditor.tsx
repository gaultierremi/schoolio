"use client";

import { useState } from "react";
import { Star } from "lucide-react";

type Stars = 1 | 2 | 3;

interface DifficultyStarsEditorProps {
  questionId: string;
  value: Stars | null;
  onChange?: (newValue: Stars | null) => void;
}

/**
 * Interactive star editor (1-3) for teacher_questions.difficulty_stars.
 * Clicking an already-selected star unsets (null). Clicking another sets it.
 * PATCHes /api/teacher-questions/[id] immediately with optimistic update +
 * rollback on error.
 */
export function DifficultyStarsEditor({
  questionId,
  value,
  onChange,
}: DifficultyStarsEditorProps) {
  const [optimistic, setOptimistic] = useState<Stars | null | undefined>(
    undefined
  );
  const [saving, setSaving] = useState(false);

  const current = optimistic !== undefined ? optimistic : value;

  async function handleClick(star: Stars) {
    if (saving) return;

    // Toggle: clicking the current value unsets it
    const next: Stars | null = current === star ? null : star;

    const prev = optimistic !== undefined ? optimistic : value;
    setOptimistic(next);
    setSaving(true);

    try {
      const res = await fetch(`/api/teacher-questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty_stars: next }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error("[DifficultyStarsEditor]", json.error ?? res.status);
        setOptimistic(prev); // rollback
      } else {
        onChange?.(next);
      }
    } catch (err) {
      console.error("[DifficultyStarsEditor]", err);
      setOptimistic(prev); // rollback
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-0.5" aria-label="Difficulté">
      {([1, 2, 3] as const).map((star) => {
        const filled = current !== null && star <= current;
        return (
          <button
            key={star}
            type="button"
            disabled={saving}
            onClick={() => handleClick(star)}
            aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
            className={`transition disabled:opacity-40 ${
              filled
                ? "text-yellow-500 hover:text-yellow-400"
                : "text-[rgb(var(--ink-3))]/50 hover:text-[rgb(var(--ink-3))]"
            }`}
          >
            <Star
              size={16}
              strokeWidth={1.5}
              fill={filled ? "currentColor" : "none"}
            />
          </button>
        );
      })}
    </div>
  );
}
