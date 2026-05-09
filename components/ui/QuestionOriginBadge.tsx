/**
 * // <QuestionOriginBadge origin="ai_generated" />
 * //   -> IA (badge bleu petit)
 *
 * // <QuestionOriginBadge origin="extracted_from_pdf" size="md" />
 * //   -> PDF prof (badge vert moyen)
 *
 * // <QuestionOriginBadge origin="ai_generated" showLabel={false} />
 * //   -> juste l'icône (cercle bleu)
 */
export type QuestionOriginBadgeProps = {
  origin: "ai_generated" | "extracted_from_pdf";
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
};

type QuestionOrigin = QuestionOriginBadgeProps["origin"];
type QuestionOriginBadgeSize = NonNullable<QuestionOriginBadgeProps["size"]>;

const originClasses: Record<QuestionOrigin, string> = {
  ai_generated: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  extracted_from_pdf: "border-green-500/30 bg-green-500/10 text-green-300",
};

const originLabels: Record<QuestionOrigin, string> = {
  ai_generated: "IA",
  extracted_from_pdf: "PDF prof",
};

const originAriaLabels: Record<QuestionOrigin, string> = {
  ai_generated: "Question générée par IA",
  extracted_from_pdf: "Question extraite du PDF du professeur",
};

const sizeClasses: Record<QuestionOriginBadgeSize, string> = {
  sm: "text-xs px-2 py-0.5 rounded-md",
  md: "text-sm px-3 py-1 rounded-lg",
};

const iconOnlySizeClasses: Record<QuestionOriginBadgeSize, string> = {
  sm: "h-6 w-6 rounded-md",
  md: "h-7 w-7 rounded-lg",
};

const iconSizeClasses: Record<QuestionOriginBadgeSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function AiGeneratedIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 1.75 9.32 5.3 12.88 6.6 9.32 7.9 8 11.45 6.68 7.9 3.12 6.6 6.68 5.3 8 1.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="m3.25 10.25.48 1.28 1.27.47-1.27.47-.48 1.28-.48-1.28L1.5 12l1.27-.47.48-1.28ZM12.75 10.25l.48 1.28 1.27.47-1.27.47-.48 1.28-.48-1.28L11 12l1.27-.47.48-1.28Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function PdfExtractedIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.25 1.75h4.9l2.6 2.6v9.9h-7.5V1.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M9 1.95V4.5h2.55M5.9 7.25h4.2M5.9 9.25h4.2M5.9 11.25h2.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

function QuestionOriginIcon({
  origin,
  className,
}: {
  origin: QuestionOrigin;
  className: string;
}) {
  if (origin === "ai_generated") {
    return <AiGeneratedIcon className={className} />;
  }

  return <PdfExtractedIcon className={className} />;
}

export function QuestionOriginBadge({
  origin,
  size = "sm",
  showLabel = true,
  className,
}: QuestionOriginBadgeProps) {
  const accessibleLabel = originAriaLabels[origin];

  return (
    <span
      aria-label={accessibleLabel}
      className={cx(
        "inline-flex min-h-6 shrink-0 items-center justify-center gap-1 border font-medium leading-none",
        originClasses[origin],
        showLabel ? sizeClasses[size] : iconOnlySizeClasses[size],
        className,
      )}
      title={accessibleLabel}
    >
      <QuestionOriginIcon
        className={cx("shrink-0", iconSizeClasses[size])}
        origin={origin}
      />
      {showLabel ? <span>{originLabels[origin]}</span> : null}
    </span>
  );
}

export default QuestionOriginBadge;
