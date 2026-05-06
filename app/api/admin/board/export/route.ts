import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { BoardCard, BoardCardPriority, BoardCardStatus, BoardCardType } from "@/lib/discord-notifications";

export const dynamic = "force-dynamic";

const CARD_TYPES: BoardCardType[] = ["bug", "feature", "idea", "comment", "task"];
const CARD_PRIORITIES: BoardCardPriority[] = ["critical", "high", "medium", "low"];
const CARD_STATUSES: BoardCardStatus[] = ["backlog", "in_progress", "review", "done", "archived"];

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

function countBy<T extends string>(cards: BoardCard[], values: T[], key: keyof BoardCard): Record<T, number> {
  const counts = Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
  for (const card of cards) {
    const value = card[key];
    if (typeof value === "string" && value in counts) {
      counts[value as T] += 1;
    }
  }
  return counts;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("token") !== process.env.BOARD_EXPORT_TOKEN) {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }

    const statusParam = searchParams.get("status");
    const statuses = statusParam
      ?.split(",")
      .map((status) => status.trim())
      .filter((status): status is BoardCardStatus => CARD_STATUSES.includes(status as BoardCardStatus));

    const admin = createAdminClient();
    let query = admin
      .from("admin_board_cards")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    const { data, error } = await query;
    if (error) throw error;

    const cards = (data ?? []) as BoardCard[];

    return NextResponse.json({
      schoolio_admin_board: {
        fetched_at: new Date().toISOString(),
        summary: {
          total: cards.length,
          by_status: countBy(cards, CARD_STATUSES, "status"),
          by_priority: countBy(cards, CARD_PRIORITIES, "priority"),
          by_type: countBy(cards, CARD_TYPES, "type"),
        },
        cards: cards.map((card) => ({
          id: card.id,
          type: card.type,
          priority: card.priority,
          status: card.status,
          title: card.title,
          description: card.description,
          created_by: card.created_by,
          created_at: card.created_at,
          updated_at: card.updated_at,
          completed_at: card.completed_at,
          tags: card.tags ?? [],
        })),
      },
    });
  } catch (error) {
    console.error("[admin/board/export]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
