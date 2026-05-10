"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PdfPageNavigator } from "@/components/ui/PdfPageNavigator";

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_HALF = 3;   // render ±3 pages around currentPage
const PAGE_GAP_PX = 12;  // vertical gap between pages in px
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.25;
const SCROLL_DEBOUNCE_MS = 100;
const ZOOM_PADDING_PX = 32; // horizontal padding when computing fit-width

// ── Types ─────────────────────────────────────────────────────────────────────

export type LivePdfViewerProps = {
  pdfUrl: string;
  currentPage: number;
  scrollY: number;
  zoom: number;
  mode: "master" | "slave";
  onPageChange?: (page: number) => void;
  onScrollChange?: (scrollY: number) => void;
  onZoomChange?: (zoom: number) => void;
  onTotalPagesLoaded?: (total: number) => void;
  className?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LivePdfViewer({
  pdfUrl,
  currentPage,
  scrollY,
  zoom,
  mode,
  onPageChange,
  onScrollChange,
  onZoomChange,
  onTotalPagesLoaded,
  className,
}: LivePdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Natural page height at scale=1 (in CSS px) — tracked from page 1 render
  const [naturalPageHeight, setNaturalPageHeight] = useState(842); // A4 fallback
  const [naturalPageWidth, setNaturalPageWidth] = useState(595);

  // Configure worker once, browser-only (module-level assignment breaks in Next.js 14 SSR eval)
  useEffect(() => {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMaster = mode === "master";

  // ── Slave: apply remote scrollY ─────────────────────────────────────────────
  useEffect(() => {
    if (isMaster || !containerRef.current) return;
    containerRef.current.scrollTop = scrollY;
  }, [isMaster, scrollY]);

  // ── Slave: scroll to page when currentPage changes (fallback) ───────────────
  useEffect(() => {
    if (isMaster || !containerRef.current || naturalPageHeight === 0) return;
    const pageTop = (currentPage - 1) * (naturalPageHeight * zoom + PAGE_GAP_PX);
    containerRef.current.scrollTop = pageTop;
  }, [isMaster, currentPage, naturalPageHeight, zoom]);

  // ── Master: scroll handler (debounced) ──────────────────────────────────────
  const handleScroll = useCallback(() => {
    if (!isMaster || !containerRef.current) return;

    const scrollTop = containerRef.current.scrollTop;
    const containerH = containerRef.current.clientHeight;
    const pageH = naturalPageHeight * zoom + PAGE_GAP_PX;

    if (pageH > 0) {
      // Page whose center is closest to the viewport center
      const viewportCenter = scrollTop + containerH / 2;
      const detectedPage = clamp(Math.floor(viewportCenter / pageH) + 1, 1, numPages || 1);
      if (detectedPage !== currentPage) {
        onPageChange?.(detectedPage);
      }
    }

    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      onScrollChange?.(scrollTop);
    }, SCROLL_DEBOUNCE_MS);
  }, [isMaster, naturalPageHeight, zoom, numPages, currentPage, onPageChange, onScrollChange]);

  // ── Master: scroll to page when currentPage changes via navigator ────────────
  // Only fire when master explicitly jumps to a page (not on scroll-triggered page updates)
  const lastScrolledPageRef = useRef(0);
  useEffect(() => {
    if (!isMaster || !containerRef.current) return;
    if (lastScrolledPageRef.current === currentPage) return;
    lastScrolledPageRef.current = currentPage;
    const pageTop = (currentPage - 1) * (naturalPageHeight * zoom + PAGE_GAP_PX);
    containerRef.current.scrollTo({ top: pageTop, behavior: "smooth" });
  }, [isMaster, currentPage, naturalPageHeight, zoom]);

  // ── Zoom handlers ────────────────────────────────────────────────────────────
  function handleZoomIn() {
    const next = clamp(Math.round((zoom + ZOOM_STEP) * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    onZoomChange?.(next);
  }

  function handleZoomOut() {
    const next = clamp(Math.round((zoom - ZOOM_STEP) * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    onZoomChange?.(next);
  }

  function handleFitWidth() {
    if (!containerRef.current || naturalPageWidth === 0) return;
    const availableW = containerRef.current.clientWidth - ZOOM_PADDING_PX;
    const fitZoom = clamp(Math.round((availableW / naturalPageWidth) * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    onZoomChange?.(fitZoom);
  }

  // ── Page load success (track natural dimensions from page 1) ─────────────────
  function handlePage1LoadSuccess(page: { getViewport: (opts: { scale: number }) => { width: number; height: number } }) {
    const vp = page.getViewport({ scale: 1 });
    setNaturalPageHeight(vp.height);
    setNaturalPageWidth(vp.width);
  }

  // ── Document load ────────────────────────────────────────────────────────────
  function handleDocumentLoadSuccess({ numPages: total }: { numPages: number }) {
    setNumPages(total);
    setLoadError(null);
    onTotalPagesLoaded?.(total);
  }

  function handleDocumentLoadError(err: Error) {
    setLoadError(err.message ?? "Erreur chargement PDF");
  }

  // ── Windowed page range ──────────────────────────────────────────────────────
  const windowStart = Math.max(1, currentPage - WINDOW_HALF);
  const windowEnd = Math.min(numPages, currentPage + WINDOW_HALF);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className={cx("flex items-center justify-center bg-gray-950 text-red-400", className)}>
        <p className="text-sm">Erreur : {loadError}</p>
      </div>
    );
  }

  return (
    <div className={cx("relative flex flex-col overflow-hidden bg-gray-950", className)}>
      {/* ── Navigator overlay (master only) ────────────────────────────────── */}
      {isMaster && numPages > 0 && (
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <PdfPageNavigator
            currentPage={currentPage}
            totalPages={numPages}
            onPageChange={(p) => onPageChange?.(p)}
            size="compact"
          />
        </div>
      )}

      {/* ── Zoom toolbar (master only) ──────────────────────────────────────── */}
      {isMaster && (
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-xl border border-gray-700 bg-gray-900/95 px-2 py-1.5 shadow-lg backdrop-blur-sm">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= ZOOM_MIN}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-white disabled:opacity-30"
            aria-label="Dézoomer"
            type="button"
          >
            −
          </button>
          <span className="min-w-[3.5rem] text-center font-mono text-xs text-gray-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_MAX}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-white disabled:opacity-30"
            aria-label="Zoomer"
            type="button"
          >
            +
          </button>
          <div className="mx-1 h-4 w-px bg-gray-700" />
          <button
            onClick={handleFitWidth}
            className="rounded-lg px-2 py-0.5 text-xs text-gray-400 hover:text-white"
            type="button"
          >
            Fit
          </button>
        </div>
      )}

      {/* ── Scroll container ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        onScroll={isMaster ? handleScroll : undefined}
        className={cx(
          "flex-1 overflow-y-auto overflow-x-hidden",
          !isMaster && "pointer-events-none overflow-hidden",
        )}
        style={{ scrollbarWidth: "thin", scrollbarColor: "#4b5563 transparent" }}
      >
        <div className="flex flex-col items-center py-6">
          <Document
            file={pdfUrl}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={
              <div className="flex flex-col items-center gap-3 pt-16 text-gray-500">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-purple-500" />
                <p className="text-sm">Chargement du PDF…</p>
              </div>
            }
          >
            {numPages > 0 &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
                const inWindow = pageNum >= windowStart && pageNum <= windowEnd;
                const renderedH = naturalPageHeight * zoom;
                const renderedW = naturalPageWidth * zoom;

                return (
                  <div
                    key={pageNum}
                    style={{ marginBottom: PAGE_GAP_PX }}
                    className="shadow-lg shadow-black/40"
                  >
                    {inWindow ? (
                      <Page
                        pageNumber={pageNum}
                        scale={zoom}
                        onLoadSuccess={pageNum === 1 ? handlePage1LoadSuccess : undefined}
                        loading={
                          <div
                            style={{ width: renderedW, height: renderedH, background: "#fff" }}
                          />
                        }
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                      />
                    ) : (
                      // Placeholder preserves scroll height for pages outside the window
                      <div
                        style={{ width: renderedW, height: renderedH, background: "#fff" }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
          </Document>
        </div>
      </div>
    </div>
  );
}

export default LivePdfViewer;
