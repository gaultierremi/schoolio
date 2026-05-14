"use client";

import { Star } from "lucide-react";

/**
 * Local-state star picker used in PendingCard before validation.
 * Does NOT persist to the API — that happens at validate-time or via
 * DifficultyStarsEditor on validated questions.
 */
export function StarSelector({
  value,
  onChange,
}: {
  value: 1 | 2 | 3 | null;
  onChange: (v: 1 | 2 | 3) => void;
}) {
  return (
    <div className="flex gap-0.5" aria-label="Difficulté">
      {([1, 2, 3] as const).map((star) => {
        const filled = value !== null && star <= value;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
            className={`transition ${
              filled
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-gray-600 hover:text-gray-400"
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
