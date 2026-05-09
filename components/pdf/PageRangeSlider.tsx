"use client";

import { useRef, useState } from "react";

type PageRangeSliderProps = {
  totalPages: number;
  value: [number, number];
  onChange: (range: [number, number]) => void;
  minRange?: number;
  disabled?: boolean;
};

type Thumb = "start" | "end";

const minPage = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPercent(page: number, totalPages: number) {
  if (totalPages <= minPage) return 0;
  return ((page - minPage) / (totalPages - minPage)) * 100;
}

function normalizeRange(
  range: [number, number],
  totalPages: number,
  minRange: number,
): [number, number] {
  const safeTotalPages = Math.max(minPage, Math.floor(totalPages));
  const safeMinRange = clamp(Math.floor(minRange), 1, safeTotalPages);
  const minimumGap = safeMinRange - 1;

  let start = clamp(Math.floor(range[0]), minPage, safeTotalPages);
  let end = clamp(Math.floor(range[1]), minPage, safeTotalPages);

  if (start > end) {
    [start, end] = [end, start];
  }

  if (end - start < minimumGap) {
    if (start + minimumGap <= safeTotalPages) {
      end = start + minimumGap;
    } else {
      start = safeTotalPages - minimumGap;
      end = safeTotalPages;
    }
  }

  return [start, end];
}

export default function PageRangeSlider({
  totalPages,
  value,
  onChange,
  minRange = 1,
  disabled = false,
}: PageRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeThumb, setActiveThumb] = useState<Thumb | null>(null);
  const safeTotalPages = Math.max(minPage, Math.floor(totalPages));
  const safeMinRange = clamp(Math.floor(minRange), 1, safeTotalPages);
  const minimumGap = safeMinRange - 1;
  const [start, end] = normalizeRange(value, safeTotalPages, safeMinRange);
  const selectedPages = end - start + 1;
  const startPercent = getPercent(start, safeTotalPages);
  const endPercent = getPercent(end, safeTotalPages);

  function updateStart(nextStart: number) {
    const clampedStart = clamp(nextStart, minPage, end - minimumGap);
    onChange([clampedStart, end]);
  }

  function updateEnd(nextEnd: number) {
    const clampedEnd = clamp(nextEnd, start + minimumGap, safeTotalPages);
    onChange([start, clampedEnd]);
  }

  function pageFromPointer(clientX: number) {
    const track = trackRef.current;
    if (!track) return minPage;

    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return clamp(
      Math.round(ratio * (safeTotalPages - minPage) + minPage),
      minPage,
      safeTotalPages,
    );
  }

  function updateFromPointer(thumb: Thumb, clientX: number) {
    const page = pageFromPointer(clientX);

    if (thumb === "start") {
      updateStart(page);
      return;
    }

    updateEnd(page);
  }

  function handleTrackPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;

    const page = pageFromPointer(event.clientX);
    const closestThumb =
      Math.abs(page - start) <= Math.abs(page - end) ? "start" : "end";

    setActiveThumb(closestThumb);
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(closestThumb, event.clientX);
  }

  function handleThumbPointerDown(
    thumb: Thumb,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (disabled) return;

    event.stopPropagation();
    setActiveThumb(thumb);
    trackRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !activeThumb) return;
    updateFromPointer(activeThumb, event.clientX);
  }

  function handlePointerEnd() {
    setActiveThumb(null);
  }

  function handleThumbKeyDown(
    thumb: Thumb,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    if (disabled) return;

    const direction = thumb === "start" ? updateStart : updateEnd;
    const currentValue = thumb === "start" ? start : end;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      direction(currentValue - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      direction(currentValue + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      direction(thumb === "start" ? minPage : start + minimumGap);
    } else if (event.key === "End") {
      event.preventDefault();
      direction(thumb === "start" ? end - minimumGap : safeTotalPages);
    }
  }

  const trackColor = disabled ? "bg-gray-700" : "bg-gray-800";
  const selectedTrackColor = disabled ? "bg-gray-700" : "bg-purple-500";
  const thumbColor = disabled
    ? "bg-gray-700 ring-gray-600"
    : "bg-purple-400 ring-purple-300 hover:ring-4 hover:ring-purple-500";
  const cursor = disabled
    ? "cursor-not-allowed"
    : activeThumb
      ? "cursor-grabbing"
      : "cursor-pointer";
  const labelColor = disabled ? "text-gray-600" : "text-gray-400";
  const counterColor = disabled ? "text-gray-600" : "text-purple-300";

  return (
    <section className="w-full rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
      <div className="grid grid-cols-3 items-center gap-2 text-sm font-medium">
        <span className={`text-left ${labelColor}`}>Page {start}</span>
        <span className={`text-center font-semibold ${counterColor}`}>
          {selectedPages} pages sélectionnées
        </span>
        <span className={`text-right ${labelColor}`}>Page {end}</span>
      </div>

      <div className="mt-6 px-2">
        <div
          ref={trackRef}
          className={`relative h-8 touch-none ${cursor}`}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
        >
          <div
            className={`absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full ${trackColor}`}
          />
          <div
            className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-full ${selectedTrackColor}`}
            style={{
              left: `${startPercent}%`,
              right: `${100 - endPercent}%`,
            }}
          />

          <ThumbButton
            label="Page de début"
            value={start}
            min={minPage}
            max={end - minimumGap}
            percent={startPercent}
            disabled={disabled}
            className={`${thumbColor} ${cursor}`}
            onPointerDown={(event) => handleThumbPointerDown("start", event)}
            onKeyDown={(event) => handleThumbKeyDown("start", event)}
          />
          <ThumbButton
            label="Page de fin"
            value={end}
            min={start + minimumGap}
            max={safeTotalPages}
            percent={endPercent}
            disabled={disabled}
            className={`${thumbColor} ${cursor}`}
            onPointerDown={(event) => handleThumbPointerDown("end", event)}
            onKeyDown={(event) => handleThumbKeyDown("end", event)}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs font-medium text-gray-500">
          <span>1</span>
          <span>...</span>
          <span>{safeTotalPages}</span>
        </div>
      </div>
    </section>
  );
}

type ThumbButtonProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  percent: number;
  disabled: boolean;
  className: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

function ThumbButton({
  label,
  value,
  min,
  max,
  percent,
  disabled,
  className,
  onPointerDown,
  onKeyDown,
}: ThumbButtonProps) {
  return (
    <button
      type="button"
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      disabled={disabled}
      className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 transition focus:outline-none focus:ring-4 focus:ring-purple-500 disabled:cursor-not-allowed ${className}`}
      style={{ left: `${percent}%` }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

export type { PageRangeSliderProps };
