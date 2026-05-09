"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * // Timer large en haut d'écran prof :
 * // <LiveSessionTimer endsAt={new Date(Date.now() + 45 * 60 * 1000)} />
 *
 * // Timer compact avec temps écoulé :
 * // <LiveSessionTimer
 * //   endsAt={new Date(Date.now() + 10 * 60 * 1000)}
 * //   startedAt={new Date(Date.now() - 35 * 60 * 1000)}
 * //   showElapsed
 * //   size="compact"
 * // />
 */
export type LiveSessionTimerProps = {
  endsAt: Date;
  startedAt?: Date;
  onExpire?: () => void;
  size?: "compact" | "large";
  showElapsed?: boolean;
  className?: string;
};

type LiveSessionTimerSize = NonNullable<LiveSessionTimerProps["size"]>;
type UrgencyLevel = "normal" | "attention" | "urgent" | "critical" | "expired";

const tickMs = 1000;
const minuteMs = 60 * 1000;

const urgencyConfig: Record<
  UrgencyLevel,
  {
    icon: string;
    label: string;
    classes: string;
  }
> = {
  normal: {
    icon: "⏱️",
    label: "Temps restant",
    classes: "border-gray-800 bg-gray-900 text-gray-300",
  },
  attention: {
    icon: "⚠️",
    label: "Fin de cours proche",
    classes: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  urgent: {
    icon: "⏳",
    label: "Dernières minutes",
    classes: "animate-pulse border-orange-500/30 bg-orange-500/10 text-orange-400",
  },
  critical: {
    icon: "⏰",
    label: "Moins d'une minute",
    classes: "animate-pulse border-red-500/40 bg-red-500/20 text-red-400",
  },
  expired: {
    icon: "⏰",
    label: "Cours terminé",
    classes: "border-red-500/40 bg-red-500/20 text-red-400",
  },
};

const containerSizeClasses: Record<LiveSessionTimerSize, string> = {
  compact: "min-h-10 gap-2 rounded-lg px-3 py-2",
  large: "min-h-16 gap-3 rounded-xl px-4 py-3 sm:px-5",
};

const timeSizeClasses: Record<LiveSessionTimerSize, string> = {
  compact: "text-2xl",
  large: "text-4xl sm:text-5xl",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getRemainingMs(endsAt: Date) {
  return endsAt.getTime() - Date.now();
}

function getElapsedMs(startedAt?: Date) {
  if (!startedAt) {
    return 0;
  }

  return Math.max(0, Date.now() - startedAt.getTime());
}

function getUrgencyLevel(remainingMs: number): UrgencyLevel {
  if (remainingMs <= 0) {
    return "expired";
  }

  if (remainingMs < minuteMs) {
    return "critical";
  }

  if (remainingMs < 5 * minuteMs) {
    return "urgent";
  }

  if (remainingMs <= 15 * minuteMs) {
    return "attention";
  }

  return "normal";
}

function formatLargeDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatCompactDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  return `${seconds}s`;
}

function formatElapsed(ms: number) {
  const totalMinutes = Math.floor(Math.max(0, ms) / minuteMs);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min écoulées`;
  }

  return `${minutes}min écoulées`;
}

export function LiveSessionTimer({
  endsAt,
  startedAt,
  onExpire,
  size = "large",
  showElapsed = false,
  className,
}: LiveSessionTimerProps) {
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(endsAt));
  const [elapsedMs, setElapsedMs] = useState(() => getElapsedMs(startedAt));
  const hasExpiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    hasExpiredRef.current = false;

    function updateTimer() {
      const nextRemainingMs = getRemainingMs(endsAt);

      setRemainingMs(nextRemainingMs);
      setElapsedMs(getElapsedMs(startedAt));

      if (nextRemainingMs <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpireRef.current?.();
      }
    }

    updateTimer();

    const intervalId = window.setInterval(updateTimer, tickMs);

    return () => window.clearInterval(intervalId);
  }, [endsAt, startedAt]);

  const urgencyLevel = getUrgencyLevel(remainingMs);
  const urgency = urgencyConfig[urgencyLevel];
  const isExpired = urgencyLevel === "expired";
  const displayTime = useMemo(() => {
    if (isExpired) {
      return "Cours terminé";
    }

    return size === "compact"
      ? formatCompactDuration(remainingMs)
      : formatLargeDuration(remainingMs);
  }, [isExpired, remainingMs, size]);

  return (
    <div
      aria-label={isExpired ? "Cours terminé" : `Temps restant : ${displayTime}`}
      className={cx(
        "inline-flex items-center border font-medium shadow-lg shadow-black/10 transition-colors duration-150",
        containerSizeClasses[size],
        urgency.classes,
        className,
      )}
      role="timer"
    >
      <span
        aria-hidden="true"
        className={cx(size === "compact" ? "text-lg" : "text-2xl")}
      >
        {urgency.icon}
      </span>

      <span className="flex min-w-0 flex-col">
        {size === "large" ? (
          <span className="text-xs font-semibold uppercase tracking-widest text-current opacity-70">
            {urgency.label}
          </span>
        ) : null}
        <span
          className={cx(
            "font-mono font-black leading-none tracking-wide",
            timeSizeClasses[size],
          )}
        >
          {displayTime}
        </span>
        {showElapsed && startedAt ? (
          <span className="mt-1 text-xs text-current opacity-70">
            {formatElapsed(elapsedMs)}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default LiveSessionTimer;
