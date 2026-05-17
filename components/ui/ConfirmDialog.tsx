"use client";

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

/**
 * // Suppression simple :
 * // <ConfirmDialog
 * //   isOpen={showDeleteConfirm}
 * //   title="Supprimer ce cours ?"
 * //   description="Cette action est irréversible."
 * //   variant="destructive"
 * //   onConfirm={handleDelete}
 * //   onCancel={() => setShowDeleteConfirm(false)}
 * // />
 *
 * // Confirmation simple :
 * // <ConfirmDialog
 * //   isOpen={showConfirm}
 * //   title="Terminer le cours live ?"
 * //   description="L'écran de classe affichera 'Cours terminé'."
 * //   confirmLabel="Terminer"
 * //   onConfirm={handleEndSession}
 * //   onCancel={() => setShowConfirm(false)}
 * // />
 *
 * // Avec async :
 * // <ConfirmDialog
 * //   isOpen={showSendConfirm}
 * //   title="Envoyer le devoir ?"
 * //   description="20 élèves recevront une notification."
 * //   onConfirm={async () => { await sendAssignment(); setShowSendConfirm(false); }}
 * //   onCancel={() => setShowSendConfirm(false)}
 * //   isLoading={isSending}
 * // />
 */
export type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: "default" | "destructive" | "warning";
  isLoading?: boolean;
  icon?: string | null;
};

type ConfirmDialogVariant = NonNullable<ConfirmDialogProps["variant"]>;

const variantConfig: Record<
  ConfirmDialogVariant,
  {
    defaultIcon: string;
    titleClasses: string;
    confirmClasses: string;
  }
> = {
  default: {
    defaultIcon: "❓",
    titleClasses: "text-white",
    confirmClasses: "bg-purple-500 text-white hover:bg-purple-600",
  },
  destructive: {
    defaultIcon: "🗑️",
    titleClasses: "text-red-100",
    confirmClasses: "bg-red-500 text-white hover:bg-red-600",
  },
  warning: {
    defaultIcon: "⚠️",
    titleClasses: "text-white",
    confirmClasses: "bg-amber-500 text-white hover:bg-amber-600",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
    />
  );
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel,
  variant = "default",
  isLoading = false,
  icon,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const config = variantConfig[variant];
  const displayedIcon = icon === undefined ? config.defaultIcon : icon;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.setTimeout(() => {
      if (!isLoading) {
        cancelButtonRef.current?.focus();
        return;
      }

      dialogRef.current?.focus();
    }, 0);
  }, [isLoading, isOpen]);

  useEffect(() => {
    if (!isOpen || isLoading) {
      return undefined;
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isLoading, isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (isLoading || event.target !== event.currentTarget) {
      return;
    }

    onCancel();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableButtons = [
      cancelButtonRef.current,
      confirmButtonRef.current,
    ].filter((button): button is HTMLButtonElement => Boolean(button && !button.disabled));

    if (focusableButtons.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstButton = focusableButtons[0];
    const lastButton = focusableButtons[focusableButtons.length - 1];

    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      firstButton.focus();
    }
  }

  function handleConfirm() {
    if (isLoading) {
      return;
    }

    void onConfirm();
  }

  return (
    // Backdrop : click-to-close + Escape global handler (registered above)
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop, Esc handled at window level (l.145-154), focus trap inside dialog
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 opacity-100 backdrop-blur-sm transition-opacity duration-150"
      onClick={handleBackdropClick}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Dialog role + onKeyDown required for Tab focus trap */}
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md scale-100 rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center shadow-2xl shadow-black/30 transition-transform duration-150"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {displayedIcon ? (
          <div aria-hidden="true" className="mb-4 text-4xl">
            {displayedIcon}
          </div>
        ) : null}

        <h2 className={cx("text-xl font-bold", config.titleClasses)} id={titleId}>
          {title}
        </h2>

        {description ? (
          <p className="mt-2 text-sm leading-6 text-gray-400" id={descriptionId}>
            {description}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-gray-700 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-300 transition-colors duration-150 hover:border-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-700 disabled:hover:text-gray-300"
            disabled={isLoading}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={cx(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-60",
              config.confirmClasses,
            )}
            disabled={isLoading}
            onClick={handleConfirm}
            ref={confirmButtonRef}
            type="button"
          >
            {isLoading ? <Spinner /> : null}
            {isLoading ? "Chargement..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
