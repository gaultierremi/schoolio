"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * // <EmptyState icon="" title="Pas encore de devoirs"
 * //   description="Tes profs n'ont pas encore créé de devoirs."
 * //   action={{ label: "Découvrir l'entraînement", href: "/train" }} />
 */
export type EmptyStateProps = {
  icon?: string | ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  variant?: "default" | "compact" | "minimal";
  className?: string;
};

type EmptyStateAction = NonNullable<EmptyStateProps["action"]>;
type ActionTone = "primary" | "secondary";

const baseActionClasses =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl px-6 py-2.5 text-center text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] focus:ring-offset-2 focus:ring-offset-[rgb(var(--surface))] sm:w-auto";

const actionToneClasses: Record<ActionTone, string> = {
  primary: "bg-[rgb(var(--accent))] text-white hover:opacity-90",
  secondary:
    "border border-[rgb(var(--border))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function renderIcon(icon: EmptyStateProps["icon"], className: string) {
  if (!icon) {
    return null;
  }

  if (typeof icon === "string") {
    return (
      <span aria-hidden="true" className={className}>
        {icon}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      {icon}
    </span>
  );
}

function EmptyStateAction({
  action,
  tone,
}: {
  action: EmptyStateAction;
  tone: ActionTone;
}) {
  const className = cx(baseActionClasses, actionToneClasses[tone]);

  if (action.href) {
    return (
      <Link aria-label={action.label} className={className} href={action.href}>
        {action.label}
      </Link>
    );
  }

  return (
    <button
      aria-label={action.label}
      className={className}
      onClick={action.onClick}
      type="button"
    >
      {action.label}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "default",
  className,
}: EmptyStateProps) {
  if (variant === "minimal") {
    return (
      <div
        className={cx(
          "flex items-center justify-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 px-4 py-4 text-center sm:text-left",
          className,
        )}
        role="status"
      >
        {renderIcon(icon, "shrink-0 text-3xl opacity-60")}
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[rgb(var(--ink))]">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">{description}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const isCompact = variant === "compact";

  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center",
        isCompact ? "gap-3 px-4 py-8" : "gap-4 px-4 py-12 sm:py-16",
        className,
      )}
      role="status"
    >
      {renderIcon(icon, isCompact ? "text-4xl opacity-60" : "text-6xl opacity-60")}
      <div className="space-y-2">
        <h3
          className={cx(
            "font-bold text-[rgb(var(--ink))]",
            isCompact ? "text-lg" : "text-xl sm:text-2xl",
          )}
        >
          {title}
        </h3>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-6 text-[rgb(var(--ink-2))] sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-2 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          {action ? <EmptyStateAction action={action} tone="primary" /> : null}
          {secondaryAction ? (
            <EmptyStateAction action={secondaryAction} tone="secondary" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default EmptyState;
