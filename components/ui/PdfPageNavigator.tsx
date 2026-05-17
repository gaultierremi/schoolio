"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

/**
 * // <PdfPageNavigator
 * //   currentPage={3}
 * //   totalPages={50}
 * //   onPageChange={(page) => updateLiveSessionPage(page)}
 * // />
 *
 * // <PdfPageNavigator
 * //   currentPage={1}
 * //   totalPages={20}
 * //   onPageChange={setPage}
 * //   size="compact"
 * //   allowJumpTo={false}
 * // />
 */
export type PdfPageNavigatorProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  size?: "compact" | "comfortable";
  disabled?: boolean;
  allowJumpTo?: boolean;
  className?: string;
};

type PdfPageNavigatorSize = NonNullable<PdfPageNavigatorProps["size"]>;

const gapClasses: Record<PdfPageNavigatorSize, string> = {
  compact: "gap-2",
  comfortable: "gap-3",
};

const buttonSizeClasses: Record<PdfPageNavigatorSize, string> = {
  compact: "min-h-10 min-w-10 px-2 py-1 text-sm",
  comfortable: "min-h-10 min-w-10 px-3 py-2 text-base",
};

const inputSizeClasses: Record<PdfPageNavigatorSize, string> = {
  compact: "h-10 w-10 text-sm",
  comfortable: "h-10 w-14 text-base",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), totalPages);
}

function isPageInRange(page: number, totalPages: number) {
  return Number.isInteger(page) && page >= 1 && page <= totalPages;
}

function NavigationButton({
  label,
  icon,
  onClick,
  disabled,
  size,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
  size: PdfPageNavigatorSize;
}) {
  return (
    <button
      aria-label={label}
      className={cx(
        "inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-800 font-semibold text-gray-300 transition-colors duration-150 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
        buttonSizeClasses[size],
        disabled && "cursor-not-allowed opacity-40 hover:bg-gray-800 hover:text-gray-300",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

export function PdfPageNavigator({
  currentPage,
  totalPages,
  onPageChange,
  size = "comfortable",
  disabled = false,
  allowJumpTo = true,
  className,
}: PdfPageNavigatorProps) {
  const hasPages = totalPages > 0;
  const normalizedCurrentPage = hasPages
    ? clampPage(currentPage, totalPages)
    : 0;
  const isDisabled = disabled || !hasPages;
  const isFirstPage = !hasPages || currentPage <= 1;
  const isLastPage = !hasPages || currentPage >= totalPages;
  const [inputValue, setInputValue] = useState(String(normalizedCurrentPage || ""));

  useEffect(() => {
    setInputValue(String(normalizedCurrentPage || ""));
  }, [normalizedCurrentPage]);

  function changePage(page: number) {
    if (isDisabled || !isPageInRange(page, totalPages) || page === currentPage) {
      return;
    }

    onPageChange(page);
  }

  function commitInputValue() {
    const parsedPage = Number(inputValue);

    if (isPageInRange(parsedPage, totalPages)) {
      changePage(parsedPage);
    }

    setInputValue(String(normalizedCurrentPage || ""));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isDisabled) {
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      changePage(normalizedCurrentPage - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      changePage(normalizedCurrentPage + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      changePage(1);
    } else if (event.key === "End") {
      event.preventDefault();
      changePage(totalPages);
    }
  }

  return (
    // Sprint 1.5 polish (a11y) : role="navigation" + onKeyDown intentionnel
    // pour fournir un raccourci clavier ←/→ aux pages PDF (utile aux SR users).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      aria-label="Navigation du PDF"
      className={cx(
        "inline-flex items-center rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
        gapClasses[size],
        className,
      )}
      onKeyDown={handleKeyDown}
      role="navigation"
      tabIndex={isDisabled ? -1 : 0}
    >
      <NavigationButton
        disabled={isDisabled || isFirstPage}
        icon="⏮"
        label="Aller à la première page"
        onClick={() => changePage(1)}
        size={size}
      />
      <NavigationButton
        disabled={isDisabled || isFirstPage}
        icon="←"
        label="Aller à la page précédente"
        onClick={() => changePage(normalizedCurrentPage - 1)}
        size={size}
      />

      <div className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-gray-800 bg-gray-900 px-2 text-gray-300">
        {hasPages ? (
          allowJumpTo ? (
            <>
              <input
                role="spinbutton"
                aria-label="Aller à la page"
                aria-valuemax={totalPages}
                aria-valuemin={1}
                aria-valuenow={normalizedCurrentPage}
                className={cx(
                  "rounded-md border border-gray-700 bg-gray-800 text-center font-mono text-white outline-none transition-colors duration-150 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50",
                  inputSizeClasses[size],
                )}
                disabled={isDisabled}
                inputMode="numeric"
                onBlur={commitInputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setInputValue(String(normalizedCurrentPage));
                    event.currentTarget.blur();
                  }
                }}
                pattern="[0-9]*"
                type="text"
                value={inputValue}
              />
              <span className={cx(size === "compact" ? "text-sm" : "text-base")}>
                / {totalPages}
              </span>
            </>
          ) : (
            <span
              className={cx(
                "font-mono text-gray-300",
                size === "compact" ? "text-sm" : "text-base",
              )}
            >
              {normalizedCurrentPage} / {totalPages}
            </span>
          )
        ) : (
          <span className="text-sm text-gray-500">Aucune page</span>
        )}
      </div>

      <NavigationButton
        disabled={isDisabled || isLastPage}
        icon="→"
        label="Aller à la page suivante"
        onClick={() => changePage(normalizedCurrentPage + 1)}
        size={size}
      />
      <NavigationButton
        disabled={isDisabled || isLastPage}
        icon="⏭"
        label="Aller à la dernière page"
        onClick={() => changePage(totalPages)}
        size={size}
      />

      <span aria-live="polite" className="sr-only">
        {hasPages
          ? `Page ${normalizedCurrentPage} sur ${totalPages}`
          : "Aucune page"}
      </span>
    </div>
  );
}

export default PdfPageNavigator;
