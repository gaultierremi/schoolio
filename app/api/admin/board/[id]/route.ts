import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import {
  BoardCard,
  BoardCardPriority,
  BoardCardStatus,
  BoardCardType,
  sendDiscordNotification,
} from "@/lib/discord-notifications";

import { ADMIN_EMAILS } from "@/lib/admin-config";

export const dynamic = "force-dynamic";

const CARD_TYPES: BoardCardType[] = ["bug", "feature", "idea", "comment", "task"];
const CARD_PRIORITIES: BoardCardPriority[] = ["low", "medium", "high", "critical"];
const CARD_STATUSES: BoardCardStatus[] = ["backlog", "in_progress", "review", "done", "archived"];

type RouteContext = {
  params: {
    id: string;
  };
};

type CardUpdate = Partial<{
  type: BoardCardType;
  title: string;
  description: string | null;
  priority: BoardCardPriority;
  status: BoardCardStatus;
  assigned_to: string | null;
  tags: string[];
}>;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCardType(value: unknown): value is BoardCardType {
  return typeof value === "string" && CARD_TYPES.includes(value as BoardCardType);
}

function isCardPriority(value: unknown): value is BoardCardPriority {
  return typeof value === "string" && CARD_PRIORITIES.includes(value as BoardCardPriority);
}

function isCardStatus(value: unknown): value is BoardCardStatus {
  return typeof value === "string" && CARD_STATUSES.includes(value as BoardCardStatus);
}

async function requireAdminUser() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[admin/board/id]", userError);
    return { response: NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 }) };
  }

  if (!user) {
    return { response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const email = user.email?.toLowerCase() ?? "";
  if (!(ADMIN_EMAILS as readonly string[]).includes(email)) {
    return { response: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  return { user: { email } };
}

function parseUpdate(body: Record<string, unknown>): { update?: CardUpdate; response?: NextResponse } {
  const update: CardUpdate = {};

  if (body.type !== undefined) {
    if (!isCardType(body.type)) {
      return { response: NextResponse.json({ error: "Type invalide" }, { status: 400 }) };
    }
    update.type = body.type;
  }

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 200) {
      return { response: NextResponse.json({ error: "Titre invalide" }, { status: 400 }) };
    }
    update.title = title;
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string" && body.description !== null) {
      return { response: NextResponse.json({ error: "Description invalide" }, { status: 400 }) };
    }
    update.description = body.description;
  }

  if (body.priority !== undefined) {
    if (!isCardPriority(body.priority)) {
      return { response: NextResponse.json({ error: "Priorité invalide" }, { status: 400 }) };
    }
    update.priority = body.priority;
  }

  if (body.status !== undefined) {
    if (!isCardStatus(body.status)) {
      return { response: NextResponse.json({ error: "Statut invalide" }, { status: 400 }) };
    }
    update.status = body.status;
  }

  if (body.assigned_to !== undefined) {
    if (typeof body.assigned_to !== "string" && body.assigned_to !== null) {
      return { response: NextResponse.json({ error: "Assignation invalide" }, { status: 400 }) };
    }
    update.assigned_to = body.assigned_to;
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string")) {
      return { response: NextResponse.json({ error: "Tags invalides" }, { status: 400 }) };
    }
    update.tags = body.tags;
  }

  return { update };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminUser();
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Body invalide" }, { status: 400 });
    }

    const parsed = parseUpdate(body);
    if (parsed.response) return parsed.response;

    const update = parsed.update ?? {};
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: previousData, error: previousError } = await admin
      .from("admin_board_cards")
      .select("*")
      .eq("id", params.id)
      .single();

    if (previousError) throw previousError;

    const previousCard = previousData as BoardCard;
    const { data, error } = await admin
      .from("admin_board_cards")
      .update(update)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) throw error;

    const card = data as BoardCard;
    if (previousCard.status !== card.status || previousCard.priority !== card.priority) {
      sendDiscordNotification("updated", card).catch(() => undefined);
    }

    return NextResponse.json({ card });
  } catch (error) {
    console.error("[admin/board/id]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAdminUser();
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const { error } = await admin.from("admin_board_cards").delete().eq("id", params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/board/id]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
