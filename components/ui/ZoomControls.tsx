"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

/**
 * // Mode prof live :
 * // <ZoomControls
 * //   zoom={zoom}
 * //   onZoomChange={setZoom}
 * //   onFitWidth={() => setZoom(calculateFitWidth())}
 * //   onReset={() => setZoom(1.0)}
 * // />
 *
 * // Compact dans toolbar :
 * // <ZoomControls
 * //   zoom={zoom}
 * //   onZoomChange={setZoom}
 * //   size="compact"
 * // />
 *
 * // Vertical :
 * // <ZoomControls
 * //   zoom={zoom}
 * //   onZoomChange={setZoom}
 * //   orientation="vertical"
 * // />
 */
export type ZoomControlsProps = {
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  step?: number;
  onZoomChange: (newZoom: number) => void;
  onFitWidth?: () => void;
  onReset?: () => void;
  size?: "compact" | "comfortable";
  orientation?: "horizontal" | "vertical";
  showPercentage?: boolean;
  disabled?: boolean;
  captureKeyboard?: boolean;
  className?: string;
};

type ZoomControlsSize = NonNullable<ZoomControlsProps["size"]>;

const buttonSizeClasses: Record<ZoomControlsSize, string> = {
  compact: "h-8 w-8 text-sm",
  comfortable: "h-10 w-10 text-base",
};

const indicatorSizeClasses: Record<ZoomControlsSize, string> = {
  compact: "h-8 w-12 text-xs",
  comfortable: "h-10 w-16 text-sm",
};

const gapClasses: Record<ZoomControlsSize, string> = {
  compact: "gap-0.5",
  comfortable: "gap-1",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampZoom(value: number, minZoom: number, maxZoom: number) {
  return Math.min(Math.max(value, minZoom), maxZoom);
}

function roundZoom(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatPercentage(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

function MinusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.5 8h9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function FitWidthIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 4.5v7M13.5 4.5v7M5.25 8h5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="m5.25 5.75-2.25 2.25 2.25 2.25M10.75 5.75 13 8l-2.25 2.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="8" cy="8" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5.25v5.5M5.25 8h5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ZoomStaticIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m10.25 10.25 3 3M7 5.25v3.5M5.25 7h3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ControlButton({
  label,
  disabled,
  onClick,
  size,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  size: ZoomControlsSize;
  children: ReactNode;
}) {
  return (
    <button
      aria-disabled={disabled}
      aria-label={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-300 transition-colors duration-150 hover:bg-gray-700 hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
        buttonSizeClasses[size],
        disabled &&
          "cursor-not-allowed opacity-40 hover:bg-gray-800 hover:text-gray-300 active:scale-100",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function ZoomControls({
  zoom,
  minZoom = 0.5,
  maxZoom = 3,
  step = 0.25,
  onZoomChange,
  onFitWidth,
  onReset,
  size = "comfortable",
  orientation = "horizontal",
  showPercentage = true,
  disabled = false,
  captureKeyboard = false,
  className,
}: ZoomControlsProps) {
  const isZoomOutDisabled = disabled || zoom <= minZoom;
  const isZoomInDisabled = disabled || zoom >= maxZoom;
  const percentage = formatPercentage(zoom);

  function zoomOut() {
    if (isZoomOutDisabled) {
      return;
    }

    onZoomChange(roundZoom(clampZoom(zoom - step, minZoom, maxZoom)));
  }

  function zoomIn() {
    if (isZoomInDisabled) {
      return;
    }

    onZoomChange(roundZoom(clampZoom(zoom + step, minZoom, maxZoom)));
  }

  function resetZoom() {
    if (disabled || !onReset) {
      return;
    }

    onReset();
  }

  useEffect(() => {
    if (!captureKeyboard) {
      return undefined;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0" && onReset && !disabled) {
        event.preventDefault();
        onReset();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    captureKeyboard,
    disabled,
    isZoomInDisabled,
    isZoomOutDisabled,
    maxZoom,
    minZoom,
    onReset,
    onZoomChange,
    step,
    zoom,
  ]);

  const zoomOutButton = (
    <ControlButton
      disabled={isZoomOutDisabled}
      label="Zoom arrière"
      onClick={zoomOut}
      size={size}
    >
      <MinusIcon />
    </ControlButton>
  );

  const zoomInButton = (
    <ControlButton
      disabled={isZoomInDisabled}
      label="Zoom avant"
      onClick={zoomIn}
      size={size}
    >
      <PlusIcon />
    </ControlButton>
  );

  const indicator = onReset ? (
    <button
      aria-disabled={disabled}
      aria-label={`Niveau de zoom actuel : ${percentage}. Réinitialiser zoom`}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-900 font-semibold tabular-nums text-gray-300 transition-colors duration-150 hover:bg-gray-800 hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
        indicatorSizeClasses[size],
        disabled &&
          "cursor-not-allowed opacity-40 hover:bg-gray-900 hover:text-gray-300 active:scale-100",
      )}
      disabled={disabled}
      onClick={resetZoom}
      type="button"
    >
      {showPercentage ? percentage : <ZoomStaticIcon />}
    </button>
  ) : (
    <div
      aria-label={`Niveau de zoom actuel : ${percentage}`}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-900 font-semibold tabular-nums text-gray-300",
        indicatorSizeClasses[size],
      )}
      role="status"
    >
      {showPercentage ? percentage : <ZoomStaticIcon />}
    </div>
  );

  const optionalButtons = (
    <>
      {onFitWidth ? (
        <ControlButton
          disabled={disabled}
          label="Ajuster à la largeur"
          onClick={onFitWidth}
          size={size}
        >
          <FitWidthIcon />
        </ControlButton>
      ) : null}
      {onReset ? (
        <ControlButton
          disabled={disabled}
          label="Réinitialiser zoom"
          onClick={onReset}
          size={size}
        >
          <ResetIcon />
        </ControlButton>
      ) : null}
    </>
  );

  return (
    <div
      className={cx(
        "inline-flex items-center",
        orientation === "horizontal" ? "flex-row" : "flex-col",
        gapClasses[size],
        className,
      )}
      data-orientation={orientation}
    >
      {orientation === "vertical" ? (
        <>
          {zoomInButton}
          {indicator}
          {zoomOutButton}
          {optionalButtons}
        </>
      ) : (
        <>
          {zoomOutButton}
          {indicator}
          {zoomInButton}
          {optionalButtons}
        </>
      )}
    </div>
  );
}

export default ZoomControls;
