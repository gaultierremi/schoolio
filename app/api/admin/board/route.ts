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

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = [
  "presti013@gmail.com",
  "gaultierremi@gmail.com",
  "kenzaboulet26@gmail.com",
  "christophe.lecrenier@gmail.com",
];

const CARD_TYPES: BoardCardType[] = ["bug", "feature", "idea", "comment", "task"];
const CARD_PRIORITIES: BoardCardPriority[] = ["low", "medium", "high", "critical"];
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
    console.error("[admin/board]", userError);
    return { response: NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 }) };
  }

  if (!user) {
    return { response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const email = user.email?.toLowerCase() ?? "";
  if (!ADMIN_EMAILS.includes(email)) {
    return { response: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  return { user: { email } };
}

export async function GET() {
  try {
    const auth = await requireAdminUser();
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_board_cards")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ cards: (data ?? []) as BoardCard[] });
  } catch (error) {
    console.error("[admin/board]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser();
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Body invalide" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 200) {
      return NextResponse.json({ error: "Titre invalide" }, { status: 400 });
    }

    if (!isCardType(body.type)) {
      return NextResponse.json({ error: "Type invalide" }, { status: 400 });
    }

    if (body.priority !== undefined && !isCardPriority(body.priority)) {
      return NextResponse.json({ error: "Priorité invalide" }, { status: 400 });
    }

    if (body.status !== undefined && !isCardStatus(body.status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    const tags =
      body.tags === undefined
        ? undefined
        : Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === "string")
          ? body.tags
          : null;

    if (tags === null) {
      return NextResponse.json({ error: "Tags invalides" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_board_cards")
      .insert({
        created_by: auth.user.email,
        type: body.type,
        title,
        description: typeof body.description === "string" ? body.description : null,
        priority: body.priority ?? undefined,
        status: body.status ?? undefined,
        assigned_to: typeof body.assigned_to === "string" ? body.assigned_to : null,
        tags,
      })
      .select("*")
      .single();

    if (error) throw error;

    const card = data as BoardCard;
    sendDiscordNotification("created", card).catch(() => undefined);

    return NextResponse.json({ card });
  } catch (error) {
    console.error("[admin/board]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
