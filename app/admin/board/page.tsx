"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import type {
  BoardCard,
  BoardCardPriority,
  BoardCardStatus,
  BoardCardType,
} from "@/lib/discord-notifications";
import { KanbanCard } from "./KanbanCard";
import { CardModal } from "./CardModal";

// ── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: { status: BoardCardStatus; label: string; colorCls: string }[] = [
  { status: "backlog",     label: "Backlog",     colorCls: "text-zinc-400"   },
  { status: "in_progress", label: "In Progress", colorCls: "text-blue-400"   },
  { status: "review",      label: "Review",      colorCls: "text-amber-400"  },
  { status: "done",        label: "Done",        colorCls: "text-green-400"  },
];

const DONE_PREVIEW = 10;

const PRIORITY_ORDER: Record<BoardCardPriority, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Filters = {
  type: BoardCardType | "all";
  priority: BoardCardPriority | "all";
  author: string;
};

type ModalState = {
  open: boolean;
  mode: "create" | "edit";
  card: BoardCard | null;
  defaultStatus?: BoardCardStatus;
};

type ToastState = { message: string; type: "ok" | "err" };

// ── Component ────────────────────────────────────────────────────────────────

export default function BoardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [cards,       setCards]       = useState<BoardCard[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filters,     setFilters]     = useState<Filters>({ type: "all", priority: "all", author: "all" });
  const [dragging,    setDragging]    = useState<{ cardId: string; fromStatus: BoardCardStatus } | null>(null);
  const [dragOver,    setDragOver]    = useState<BoardCardStatus | null>(null);
  const [modal,       setModal]       = useState<ModalState>({ open: false, mode: "create", card: null });
  const [toast,       setToast]       = useState<ToastState | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [realtimeOk,  setRealtimeOk]  = useState(true);

  const pollingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref-backed dragging so the realtime closure always reads the latest value
  const draggingRef   = useRef(dragging);
  draggingRef.current = dragging;

  // ── State helpers ──────────────────────────────────────────────────────────

  function showToast(message: string, type: ToastState["type"] = "ok") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }

  function patchCard(id: string, patch: Partial<BoardCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function upsertCard(card: BoardCard) {
    setCards((prev) =>
      prev.some((c) => c.id === card.id)
        ? prev.map((c) => (c.id === card.id ? card : c))
        : [card, ...prev]
    );
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchCards() {
    try {
      const res = await fetch("/api/admin/board");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { cards: BoardCard[] };
      setCards(data.cards ?? []);
    } catch {
      showToast("Erreur de connexion au serveur", "err");
    }
  }

  // ── Realtime + polling fallback ────────────────────────────────────────────

  useEffect(() => {
    fetchCards().finally(() => setLoading(false));

    const channel = supabase
      .channel("board-realtime")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "admin_board_cards" }, (payload: any) => {
        const { eventType } = payload as { eventType: string };
        if (eventType === "INSERT") {
          upsertCard(payload.new as BoardCard);
        } else if (eventType === "UPDATE") {
          const updated = payload.new as BoardCard;
          // Don't overwrite the card currently being dragged — avoids visual flicker
          if (draggingRef.current?.cardId !== updated.id) {
            setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          }
        } else if (eventType === "DELETE") {
          removeCard((payload.old as { id: string }).id);
        }
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setRealtimeOk(true);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeOk(false);
          if (!pollingRef.current) {
            pollingRef.current = setInterval(fetchCards, 30_000);
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  function handleDragStart(cardId: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    setDragging({ cardId, fromStatus: card.status });
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOver(null);
  }

  async function handleDrop(targetStatus: BoardCardStatus) {
    if (!dragging) return;
    const { cardId, fromStatus } = dragging;
    setDragging(null);
    setDragOver(null);
    if (fromStatus === targetStatus) return;

    patchCard(cardId, { status: targetStatus }); // optimistic
    try {
      const res = await fetch(`/api/admin/board/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      patchCard(cardId, { status: fromStatus }); // revert
      showToast("Erreur lors du déplacement", "err");
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (card.status === "archived") return false;
      if (filters.type !== "all" && card.type !== filters.type) return false;
      if (filters.priority !== "all" && card.priority !== filters.priority) return false;
      if (filters.author !== "all" && card.created_by !== filters.author) return false;
      return true;
    });
  }, [cards, filters]);

  function getColumnCards(status: BoardCardStatus): BoardCard[] {
    const col = filteredCards.filter((c) => c.status === status);
    if (status === "done") {
      return [...col].sort((a, b) => {
        const aDate = a.completed_at ?? a.updated_at ?? a.created_at ?? "";
        const bDate = b.completed_at ?? b.updated_at ?? b.created_at ?? "";
        return bDate.localeCompare(aDate);
      });
    }
    return [...col].sort(
      (a, b) =>
        PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] ||
        (b.created_at ?? "").localeCompare(a.created_at ?? "")
    );
  }

  const authors = useMemo(
    () => Array.from(new Set(cards.map((c) => c.created_by).filter(Boolean))),
    [cards]
  );

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openCreate(defaultStatus?: BoardCardStatus) {
    setModal({ open: true, mode: "create", card: null, defaultStatus });
  }
  function openEdit(card: BoardCard) {
    setModal({ open: true, mode: "edit", card });
  }
  function closeModal() {
    setModal((prev) => ({ ...prev, open: false }));
  }

  function onCardCreated(card: BoardCard) {
    upsertCard(card);
    showToast("Carte créée");
  }
  function onCardUpdated(card: BoardCard) {
    upsertCard(card); // archived cards get filtered out by filteredCards memo
    showToast("Carte mise à jour");
  }
  function onCardDeleted(id: string) {
    removeCard(id);
    showToast("Carte supprimée");
  }

  // ── Done column data ──────────────────────────────────────────────────────

  const doneCards        = getColumnCards("done");
  const doneTotalCount   = doneCards.length;
  const doneHiddenCount  = doneTotalCount - DONE_PREVIEW;
  const doneVisibleCards = showAllDone ? doneCards : doneCards.slice(0, DONE_PREVIEW);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-white/40">Chargement du board…</p>
        </div>
      </main>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Sticky header ── */}
      <header className="shrink-0 sticky top-0 z-20 bg-gray-950/90 backdrop-blur-sm border-b border-white/10 px-4 lg:px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">

          {/* Title row */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link href="/" className="text-sm text-white/40 hover:text-purple-400 transition-colors shrink-0">
              ← Retour
            </Link>
            <h1 className="text-sm font-bold text-white truncate">Board Kanban</h1>
            {!realtimeOk && (
              <span className="shrink-0 text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                ⚡ polling 30s
              </span>
            )}
          </div>

          {/* Filters + new card */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters["type"] }))}
              className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">Tous types</option>
              <option value="task">✅ Tâche</option>
              <option value="bug">🐛 Bug</option>
              <option value="feature">✨ Feature</option>
              <option value="idea">💡 Idée</option>
              <option value="comment">💬 Note</option>
            </select>

            <select
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as Filters["priority"] }))}
              className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">Toutes priorités</option>
              <option value="critical">⚠ Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={filters.author}
              onChange={(e) => setFilters((f) => ({ ...f, author: e.target.value }))}
              className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">Tous auteurs</option>
              {authors.map((a) => (
                <option key={a} value={a}>{a.split("@")[0]}</option>
              ))}
            </select>

            <button
              onClick={() => openCreate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
            >
              + Nouvelle carte
            </button>
          </div>
        </div>
      </header>

      {/* ── Kanban board ── */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 h-full" style={{ minWidth: "min(100%, 320px)" }}>

          {COLUMNS.map((col) => {
            const colCards     = col.status === "done" ? doneCards     : getColumnCards(col.status);
            const displayCards = col.status === "done" ? doneVisibleCards : colCards;
            const isOver       = dragOver === col.status && !!dragging;

            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragging && dragOver !== col.status) setDragOver(col.status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOver(null);
                  }
                }}
                onDrop={(e) => { e.preventDefault(); handleDrop(col.status); }}
                className={[
                  "rounded-2xl flex flex-col transition-colors duration-150 border",
                  isOver
                    ? "border-purple-500/60 bg-purple-500/5"
                    : "border-white/5 bg-gray-950",
                ].join(" ")}
                style={{ maxHeight: "calc(100vh - 120px)" }}
              >
                {/* Column header */}
                <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b border-white/5 rounded-t-2xl bg-gray-950">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${col.colorCls}`}>{col.label}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 text-xs font-medium tabular-nums">
                      {colCards.length}
                    </span>
                  </div>
                  <button
                    onClick={() => openCreate(col.status)}
                    title={`Ajouter dans ${col.label}`}
                    className="text-white/20 hover:text-purple-400 transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
                  >
                    +
                  </button>
                </div>

                {/* Cards list */}
                <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">

                  {displayCards.map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      isDragging={dragging?.cardId === card.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onClick={openEdit}
                    />
                  ))}

                  {/* Empty state */}
                  {colCards.length === 0 && (
                    <button
                      onClick={() => openCreate(col.status)}
                      className="w-full py-8 flex flex-col items-center gap-1 text-center rounded-xl border border-dashed border-white/5 hover:border-purple-500/20 transition-colors"
                    >
                      <span className="text-xs text-white/20">Aucune carte</span>
                      <span className="text-xs text-white/10">+ Cliquez pour créer</span>
                    </button>
                  )}

                  {/* Done: "Voir tout" button */}
                  {col.status === "done" && !showAllDone && doneHiddenCount > 0 && (
                    <button
                      onClick={() => setShowAllDone(true)}
                      className="w-full py-2.5 text-xs text-white/30 hover:text-purple-400 transition-colors border border-dashed border-white/10 hover:border-purple-500/30 rounded-lg"
                    >
                      Voir tout l'historique ({doneTotalCount} cartes)
                    </button>
                  )}

                  {/* Done: "Réduire" button */}
                  {col.status === "done" && showAllDone && doneTotalCount > DONE_PREVIEW && (
                    <button
                      onClick={() => setShowAllDone(false)}
                      className="w-full py-2.5 text-xs text-white/30 hover:text-purple-400 transition-colors border border-dashed border-white/10 hover:border-purple-500/30 rounded-lg"
                    >
                      ↑ Réduire
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modal ── */}
      {modal.open && (
        <CardModal
          mode={modal.mode}
          card={modal.card ?? undefined}
          defaultStatus={modal.defaultStatus}
          onClose={closeModal}
          onCreated={onCardCreated}
          onUpdated={onCardUpdated}
          onDeleted={onCardDeleted}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={[
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-xl text-sm font-medium",
            "border backdrop-blur-sm whitespace-nowrap",
            toast.type === "err"
              ? "bg-red-900/90 border-red-500/30 text-red-200"
              : "bg-gray-800/90 border-white/10 text-white",
          ].join(" ")}
        >
          {toast.message}
        </div>
      )}
    </main>
  );
}
