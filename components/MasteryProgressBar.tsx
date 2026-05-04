"use client";

// <MasteryProgressBar from={45} to={62} label="Révolution française" emoji="️" size="md" />

import { motion } from "framer-motion";

type MasteryProgressBarProps = {
  from: number;
  to: number;
  showDelta?: boolean;
  label?: string;
  emoji?: string;
  size?: "sm" | "md" | "lg";
};

const heightBySize: Record<NonNullable<MasteryProgressBarProps["size"]>, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-3.5",
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function getBarColor(value: number) {
  if (value < 30) {
    return "bg-red-400";
  }

  if (value < 60) {
    return "bg-orange-400";
  }

  return "bg-emerald-500";
}

export default function MasteryProgressBar({
  from,
  to,
  showDelta,
  label,
  emoji,
  size = "md",
}: MasteryProgressBarProps) {
  const startValue = clampPercent(from);
  const finalValue = clampPercent(to);
  const delta = finalValue - startValue;
  const shouldShowDelta = delta > 0 && showDelta !== false;

  return (
    <div className="w-full">
      {label ? (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm font-medium">
            {emoji ? <span className="mr-1.5" aria-hidden="true">{emoji}</span> : null}
            <span className="truncate align-middle">{label}</span>
          </div>
          <span className="shrink-0 text-xs text-slate-500">{Math.round(finalValue)}%</span>
        </div>
      ) : null}

      <div className="relative flex w-full items-center gap-2">
        <div className={`w-full overflow-hidden rounded-full bg-slate-200 ${heightBySize[size]}`}>
          <motion.div
            className={`h-full rounded-full ${getBarColor(finalValue)}`}
            initial={{ width: `${startValue}%` }}
            animate={{ width: `${finalValue}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        {shouldShowDelta ? (
          <motion.span
            className="pointer-events-none absolute right-0 text-sm font-semibold text-emerald-500"
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            +{Math.round(delta)}
          </motion.span>
        ) : null}
      </div>
    </div>
  );
}

export type { MasteryProgressBarProps };
