"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * // Mode prof full :
 * // <PairingCodeDisplay
 * //   code="A4F2K9"
 * //   onRegenerate={() => regenerateCode()}
 * //   expiresAt={new Date(Date.now() + 90 * 60 * 1000)}
 * // />
 *
 * // Mode compact dans un header :
 * // <PairingCodeDisplay code="A4F2K9" size="compact" />
 */
export type PairingCodeDisplayProps = {
  code: string;
  size?: "compact" | "full";
  copyable?: boolean;
  onCopy?: () => void;
  onRegenerate?: () => void;
  expiresAt?: Date;
  className?: string;
};

type PairingCodeSize = NonNullable<PairingCodeDisplayProps["size"]>;

const copiedFeedbackDurationMs = 2000;
const countdownTickMs = 1000;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function CopyIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.25 5.25h7v7h-7v-7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M3.75 10.75h-1v-8h8v1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13 5.25A5.25 5.25 0 0 0 3.2 4.1L2.5 5.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M2.5 2.5v2.75h2.75M3 10.75a5.25 5.25 0 0 0 9.8 1.15l.7-1.15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M13.5 13.5v-2.75h-2.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m3 8.25 3.1 3.1L13 4.65"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getRemainingSeconds(expiresAt?: Date) {
  if (!expiresAt) {
    return null;
  }

  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getCountdownClasses(seconds: number) {
  if (seconds < 30) {
    return "text-red-400";
  }

  if (seconds < 120) {
    return "text-orange-400";
  }

  return "text-gray-500";
}

function CodeTiles({
  code,
  size,
}: {
  code: string;
  size: PairingCodeSize;
}) {
  const characters = useMemo(() => Array.from(code), [code]);

  return (
    <span
      className={cx(
        "inline-flex items-center justify-center font-mono font-black tracking-widest text-white",
        size === "full"
          ? "gap-1.5 text-4xl sm:gap-2 sm:text-6xl"
          : "gap-1 text-2xl",
      )}
    >
      {characters.map((character, index) => (
        <span
          aria-label={`Caractère ${index + 1} : ${character}`}
          className={cx(
            "inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 leading-none",
            size === "full" ? "min-w-10 px-2 py-3 sm:min-w-16 sm:px-4" : "min-w-8 px-2 py-1",
          )}
          key={`${character}-${index}`}
        >
          {character}
        </span>
      ))}
    </span>
  );
}

export function PairingCodeDisplay({
  code,
  size = "full",
  copyable = true,
  onCopy,
  onRegenerate,
  expiresAt,
  className,
}: PairingCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(expiresAt),
  );

  useEffect(() => {
    setRemainingSeconds(getRemainingSeconds(expiresAt));

    if (!expiresAt) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(expiresAt));
    }, countdownTickMs);

    return () => window.clearInterval(intervalId);
  }, [expiresAt]);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, copiedFeedbackDurationMs);

    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  useEffect(() => {
    if (!isRegenerating) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsRegenerating(false);
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [isRegenerating]);

  async function handleCopy() {
    if (!copyable) {
      return;
    }

    await navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy?.();
  }

  function handleRegenerate() {
    setIsRegenerating(true);
    onRegenerate?.();
  }

  const countdown = remainingSeconds === null ? null : (
    <span className={cx("text-xs", getCountdownClasses(remainingSeconds))}>
      Expire dans {formatCountdown(remainingSeconds)}
    </span>
  );

  if (size === "compact") {
    return (
      <div
        className={cx(
          "inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/80 px-2 py-1",
          className,
        )}
      >
        <button
          aria-label={copyable ? `Copier le code ${code}` : `Code de pairing ${code}`}
          className={cx(
            "rounded-lg outline-none transition-transform focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950",
            copyable && "cursor-pointer hover:scale-[1.02] active:scale-[0.99]",
          )}
          disabled={!copyable}
          onClick={handleCopy}
          type="button"
        >
          <CodeTiles code={code} size="compact" />
        </button>
        {copyable ? (
          <button
            aria-label={`Copier le code ${code}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950"
            onClick={handleCopy}
            type="button"
          >
            {copied ? <CheckIcon className="h-4 w-4 text-green-300" /> : <CopyIcon className="h-4 w-4" />}
          </button>
        ) : null}
        {countdown}
        <span aria-live="polite" className="sr-only">
          {copied ? "Copié" : ""}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-2xl border border-gray-800 bg-gray-900 p-4 text-center shadow-2xl shadow-black/20 sm:p-6",
        className,
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        Code pour l'écran de classe
      </span>

      <button
        aria-label={copyable ? `Copier le code ${code}` : `Code de pairing ${code}`}
        className={cx(
          "mt-4 rounded-xl outline-none transition-transform focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950",
          copyable && "cursor-pointer hover:scale-[1.02] active:scale-[0.99]",
        )}
        disabled={!copyable}
        onClick={handleCopy}
        type="button"
      >
        <CodeTiles code={code} size="full" />
      </button>

      <div className="mt-4 flex min-h-8 flex-wrap items-center justify-center gap-3">
        {copyable ? (
          <button
            aria-label={`Copier le code ${code}`}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950"
            onClick={handleCopy}
            type="button"
          >
            {copied ? <CheckIcon className="h-4 w-4 text-green-300" /> : <CopyIcon className="h-4 w-4" />}
            <span aria-live="polite">{copied ? "Copié" : "Copier"}</span>
          </button>
        ) : (
          <span aria-live="polite" className="sr-only">
            {copied ? "Copié" : ""}
          </span>
        )}

        {countdown}
      </div>

      {onRegenerate ? (
        <button
          className="mt-3 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-sm text-gray-500 transition-colors hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950"
          onClick={handleRegenerate}
          type="button"
        >
          <RefreshIcon
            className={cx(
              "h-4 w-4 transition-transform duration-500",
              isRegenerating && "rotate-180 text-purple-300",
            )}
          />
          Régénérer
        </button>
      ) : null}
    </div>
  );
}

export default PairingCodeDisplay;
