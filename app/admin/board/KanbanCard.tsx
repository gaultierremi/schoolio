"use client";

import type { BoardCard, BoardCardPriority, BoardCardType } from "@/lib/discord-notifications";

const PRIORITY_STYLES: Record<
  BoardCardPriority,
  { border: string; badge: string; text: string; label: string }
> = {
  critical: { border: "border-red-500/50",    badge: "bg-red-500/20",    text: "text-red-300",    label: "Critical" },
  high:     { border: "border-orange-500/50", badge: "bg-orange-500/20", text: "text-orange-300", label: "High"     },
  medium:   { border: "border-purple-500/50", badge: "bg-purple-500/20", text: "text-purple-300", label: "Medium"   },
  low:      { border: "border-zinc-600/50",   badge: "bg-zinc-700/40",   text: "text-zinc-400",   label: "Low"      },
};

const TYPE_STYLES: Record<
  BoardCardType,
  { badge: string; text: string; emoji: string; label: string }
> = {
  bug:     { badge: "bg-red-900/50",    text: "text-red-300",    emoji: "🐛", label: "Bug"     },
  feature: { badge: "bg-violet-900/50", text: "text-violet-300", emoji: "✨", label: "Feature" },
  idea:    { badge: "bg-yellow-900/50", text: "text-yellow-300", emoji: "💡", label: "Idée"    },
  comment: { badge: "bg-blue-900/50",   text: "text-blue-300",   emoji: "💬", label: "Note"    },
  task:    { badge: "bg-green-900/50",  text: "text-green-300",  emoji: "✅", label: "Tâche"   },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("fr-BE", { day: "2-digit", month: "short" });
}

type Props = {
  card: BoardCard;
  isDragging: boolean;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onClick: (card: BoardCard) => void;
};

export function KanbanCard({ card, isDragging, onDragStart, onDragEnd, onClick }: Props) {
  const priority = PRIORITY_STYLES[card.priority];
  const type = TYPE_STYLES[card.type];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ouvrir la carte ${card.title}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(card);
        }
      }}
      className={[
        "rounded-xl border bg-gray-900 p-3 cursor-pointer select-none",
        "transition-all duration-150",
        "hover:border-purple-500/40 hover:bg-gray-800/80 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
        priority.border,
        isDragging ? "opacity-40 scale-95 rotate-1" : "",
      ].join(" ")}
    >
      {/* Type + Priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${type.badge} ${type.text}`}>
          {type.emoji} {type.label}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priority.badge} ${priority.text}`}>
          {priority.label}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-white leading-snug mb-2">{card.title}</p>

      {/* Description preview */}
      {card.description && (
        <p className="text-xs text-white/40 leading-relaxed mb-2 line-clamp-2">{card.description}</p>
      )}

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-white/5 text-white/40">
              #{tag}
            </span>
          ))}
          {card.tags.length > 3 && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-white/5 text-white/40">
              +{card.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-1 pt-2 border-t border-white/5">
        <span className="text-xs text-white/25 truncate">
          {card.assigned_to ? card.assigned_to.split("@")[0] : "Non assigné"}
        </span>
        <span className="text-xs text-white/20 shrink-0">{formatDate(card.created_at)}</span>
      </div>
    </div>
  );
}
