export type BoardCardType = "bug" | "feature" | "idea" | "comment" | "task";
export type BoardCardPriority = "low" | "medium" | "high" | "critical";
export type BoardCardStatus = "backlog" | "in_progress" | "review" | "done" | "archived";

export type BoardCard = {
  id: string;
  created_by: string;
  type: BoardCardType;
  title: string;
  description: string | null;
  priority: BoardCardPriority;
  status: BoardCardStatus;
  assigned_to: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

export async function sendDiscordNotification(action: "created" | "updated", card: BoardCard) {
  const url = process.env.DISCORD_BOARD_WEBHOOK_URL;
  if (!url) {
    console.warn("[discord] DISCORD_BOARD_WEBHOOK_URL not set, skipping");
    return;
  }

  const colorMap: Record<BoardCardPriority, number> = {
    critical: 0xef4444,
    high: 0xf97316,
    medium: 0xa855f7,
    low: 0x71717a,
  };

  const emojiMap: Record<BoardCardType, string> = {
    bug: "",
    feature: "✨",
    idea: "",
    comment: "",
    task: "",
  };

  const actionLabel = action === "created" ? "Nouvelle carte" : "Carte mise à jour";

  const embed = {
    title: `${emojiMap[card.type]} ${card.title}`,
    description: card.description ? card.description.slice(0, 200) : null,
    color: colorMap[card.priority],
    fields: [
      { name: "Type", value: card.type, inline: true },
      { name: "Priorité", value: card.priority, inline: true },
      { name: "Statut", value: card.status, inline: true },
      { name: "Créée par", value: card.created_by, inline: false },
    ],
    footer: { text: `Schoolio Admin Board · ${actionLabel}` },
    timestamp: card.updated_at || card.created_at,
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (error) {
    console.error("[discord] notification failed:", error);
  }
}
