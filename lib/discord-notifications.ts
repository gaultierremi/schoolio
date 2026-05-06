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

  const payload = JSON.stringify({ embeds: [embed] });
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Schoolio-Bot/1.0 (https://schoolio-two.vercel.app)",
  };

  async function attempt(webhookUrl: string): Promise<void> {
    const res = await fetch(webhookUrl, { method: "POST", headers, body: payload });
    if (!res.ok) throw new Error(`Discord responded ${res.status}`);
  }

  try {
    await attempt(url);
  } catch (firstErr) {
    const retryable =
      firstErr instanceof TypeError ||
      (firstErr instanceof Error &&
        (firstErr.message.includes("ECONNRESET") ||
          firstErr.message.includes("socket disconnected") ||
          firstErr.message.includes("network")));

    if (!retryable) {
      console.error("[discord] notification failed:", firstErr);
      return;
    }

    await new Promise((r) => setTimeout(r, 1000));
    try {
      await attempt(url);
    } catch (retryErr) {
      console.error("[discord] notification failed after retry:", retryErr);
    }
  }
}
