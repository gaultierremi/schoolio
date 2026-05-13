import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://schoolio-two.vercel.app";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/classes/[id]/invite-qr — returns a PNG QR code for the class join link
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const classId = params.id;
  if (typeof classId !== "string" || !/^[0-9a-f-]{36}$/i.test(classId)) {
    return NextResponse.json({ error: "ID de classe invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: cls } = await admin
    .from("classes")
    .select("invitation_code")
    .eq("id", classId)
    .eq("teacher_id", auth.user.id)
    .maybeSingle();

  if (!cls) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
  if (!cls.invitation_code) {
    return NextResponse.json({ error: "Code d'invitation manquant" }, { status: 404 });
  }

  const joinUrl = `${SITE_URL}/join?code=${cls.invitation_code}`;

  try {
    const dataUrl = await QRCode.toDataURL(joinUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });

    // dataUrl is "data:image/png;base64,<b64>"
    const base64 = dataUrl.split(",")[1];
    const pngBytes = Buffer.from(base64, "base64");

    return new NextResponse(new Uint8Array(pngBytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[invite-qr:GET]", err);
    return NextResponse.json({ error: "Erreur génération QR" }, { status: 500 });
  }
}
