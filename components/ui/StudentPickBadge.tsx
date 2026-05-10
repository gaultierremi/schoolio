"use client";

import { useEffect, useRef, useState } from "react";

/**
 * // Liste de présences :
 * // <StudentPickBadge pickCount={3} />
 * // -> 3 (badge violet moyen)
 *
 * // Avec label :
 * // <StudentPickBadge pickCount={1} showLabel />
 * // -> "1 tirage" (badge violet clair)
 *
 * // Élève champion :
 * // <StudentPickBadge pickCount={12} size="comfortable" />
 * // -> 9+ (badge violet foncé, plus gros)
 *
 * // Élève jamais tiré :
 * // <StudentPickBadge pickCount={0} />
 * // -> 0 (badge gris)
 */
export type StudentPickBadgeProps = {
  pickCount: number;
  size?: "compact" | "comfortable";
  showLabel?: boolean;
  className?: string;
};

type StudentPickBadgeSize = NonNullable<StudentPickBadgeProps["size"]>;
type PickLevel = "none" | "low" | "moderate" | "high";

const pulseDurationMs = 1000;

const sizeClasses: Record<StudentPickBadgeSize, string> = {
  compact: "min-w-6 px-2 py-0.5 text-xs font-semibold",
  comfortable: "min-w-8 px-3 py-1 text-sm font-bold",
};

const levelClasses: Record<PickLevel, string> = {
  none: "border-gray-700 bg-gray-800 text-gray-500",
  low: "border-purple-500/20 bg-purple-500/10 text-purple-300",
  moderate: "border-purple-500/40 bg-purple-500/20 text-purple-200",
  high: "border-purple-500/60 bg-purple-500/30 text-white",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizePickCount(pickCount: number) {
  if (!Number.isFinite(pickCount)) {
    return 0;
  }

  return Math.max(0, Math.floor(pickCount));
}

function getPickLevel(pickCount: number): PickLevel {
  if (pickCount === 0) {
    return "none";
  }

  if (pickCount <= 2) {
    return "low";
  }

  if (pickCount <= 5) {
    return "moderate";
  }

  return "high";
}

function getDisplayCount(pickCount: number) {
  if (pickCount > 99) {
    return "99+";
  }

  if (pickCount >= 9) {
    return "9+";
  }

  return String(pickCount);
}

function getPickLabel(pickCount: number) {
  return pickCount === 1 ? "tirage" : "tirages";
}

function getAccessibleLabel(pickCount: number) {
  if (pickCount === 0) {
    return "Pas encore tiré";
  }

  if (pickCount === 1) {
    return "Tiré 1 fois en 30 jours";
  }

  return `Tiré ${pickCount} fois en 30 jours`;
}

export function StudentPickBadge({
  pickCount,
  size = "compact",
  showLabel = false,
  className,
}: StudentPickBadgeProps) {
  const normalizedPickCount = normalizePickCount(pickCount);
  const previousPickCountRef = useRef(normalizedPickCount);
  const [isPulsing, setIsPulsing] = useState(false);
  const level = getPickLevel(normalizedPickCount);
  const displayCount = getDisplayCount(normalizedPickCount);
  const accessibleLabel = getAccessibleLabel(normalizedPickCount);

  useEffect(() => {
    if (normalizedPickCount > previousPickCountRef.current) {
      setIsPulsing(true);

      const timeoutId = window.setTimeout(() => {
        setIsPulsing(false);
      }, pulseDurationMs);

      previousPickCountRef.current = normalizedPickCount;
      return () => window.clearTimeout(timeoutId);
    }

    previousPickCountRef.current = normalizedPickCount;
    return undefined;
  }, [normalizedPickCount]);

  return (
    <span
      aria-label={accessibleLabel}
      className={cx(
        "inline-flex items-center justify-center gap-1 rounded-full border text-center leading-none tabular-nums transition-colors duration-200",
        sizeClasses[size],
        levelClasses[level],
        isPulsing && "animate-pulse",
        className,
      )}
      title={accessibleLabel}
    >
      <span>{displayCount}</span>
      {showLabel ? <span>{getPickLabel(normalizedPickCount)}</span> : null}
    </span>
  );
}

export default StudentPickBadge;
