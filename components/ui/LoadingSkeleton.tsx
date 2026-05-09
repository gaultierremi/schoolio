import type { CSSProperties } from "react";

/**
 * // <LoadingSkeleton variant="card" count={3} />
 * // <LoadingSkeleton variant="text" lines={4} />
 * // <LoadingSkeleton variant="list" count={5} />
 * // <LoadingSkeleton variant="table" rows={8} />
 */
export type LoadingSkeletonProps = {
  variant?: "text" | "card" | "avatar" | "button" | "table" | "list";
  count?: number;
  lines?: number;
  rows?: number;
  width?: string;
  height?: string;
  className?: string;
  animated?: boolean;
};

const textWidths = ["w-full", "w-[90%]", "w-3/4"];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getItems(count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index);
}

function getSizeStyle(width?: string, height?: string): CSSProperties | undefined {
  if (!width && !height) {
    return undefined;
  }

  return {
    width,
    height,
  };
}

function SkeletonBlock({
  className,
  animated,
  width,
  height,
}: {
  className: string;
  animated: boolean;
  width?: string;
  height?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cx("bg-gray-800", animated && "animate-pulse", className)}
      style={getSizeStyle(width, height)}
    />
  );
}

export function LoadingSkeleton({
  variant = "text",
  count = 1,
  lines = 3,
  rows = 5,
  width,
  height,
  className,
  animated = true,
}: LoadingSkeletonProps) {
  if (variant === "text") {
    return (
      <div
        aria-label="Chargement"
        className={cx("space-y-2", className)}
        role="status"
      >
        {getItems(lines).map((line) => (
          <SkeletonBlock
            key={line}
            animated={animated}
            className={cx("h-3 rounded-md sm:h-4", textWidths[line % textWidths.length])}
            height={height}
            width={width}
          />
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        aria-label="Chargement"
        className={cx("grid gap-4", className)}
        role="status"
      >
        {getItems(count).map((item) => (
          <SkeletonBlock
            key={item}
            animated={animated}
            className="h-32 rounded-2xl sm:h-40"
            height={height}
            width={width}
          />
        ))}
      </div>
    );
  }

  if (variant === "avatar") {
    return (
      <div aria-label="Chargement" className={className} role="status">
        <SkeletonBlock
          animated={animated}
          className="h-12 w-12 rounded-full"
          height={height}
          width={width}
        />
      </div>
    );
  }

  if (variant === "button") {
    return (
      <div aria-label="Chargement" className={className} role="status">
        <SkeletonBlock
          animated={animated}
          className="h-10 w-32 rounded-xl"
          height={height}
          width={width}
        />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div
        aria-label="Chargement"
        className={cx("space-y-2", className)}
        role="status"
      >
        <SkeletonBlock
          animated={animated}
          className="h-10 rounded-md bg-gray-700"
          height={height}
          width={width}
        />
        {getItems(rows).map((row) => (
          <SkeletonBlock
            key={row}
            animated={animated}
            className="h-10 rounded-md"
            height={height}
            width={width}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-label="Chargement"
      className={cx("space-y-3", className)}
      role="status"
    >
      {getItems(count).map((item) => (
        <div
          key={item}
          className={cx(
            "flex items-center gap-4 rounded-xl bg-gray-900 p-4",
            animated && "animate-pulse",
          )}
        >
          <div aria-hidden="true" className="h-12 w-12 shrink-0 rounded-full bg-gray-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div aria-hidden="true" className="h-4 w-3/4 rounded-md bg-gray-800" />
            <div aria-hidden="true" className="h-3 w-1/2 rounded-md bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default LoadingSkeleton;
