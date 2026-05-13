import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { resolveUserRole } from "@/lib/auth/role-resolver";

const FOUNDER_TENANT = "00000000-0000-0000-0000-000000000001";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Resolve the authenticated user via the session-aware client
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let finalRole: "teacher" | "student" | "admin" = "student";

      if (user && user.email) {
        const admin = createAdminClient();

        // Always re-resolve role from the founder_teachers whitelist. This is
        // the source of truth — if it has changed since the user's last login
        // (e.g., admin promoted them via /admin/founders), the change takes
        // effect on next login.
        const correctRole = await resolveUserRole(user.email);
        finalRole = correctRole;

        // Check if a user_profiles row already exists
        const { data: existing } = await admin
          .from("user_profiles")
          .select("id, role, school_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!existing) {
          // First login — assign role + scope to FounderTestGround tenant
          // Derive a display name from Google profile (user_metadata is safe
          // for display data only — role comes from our resolver, not metadata).
          const rawName = (user.user_metadata?.full_name as string | undefined)
            ?? (user.user_metadata?.name as string | undefined)
            ?? user.email.split("@")[0];
          const userName = String(rawName).slice(0, 100);

          await admin.from("user_profiles").insert({
            id: user.id,
            role: correctRole,
            school_id: FOUNDER_TENANT,
            user_name: userName,
          });

          await admin.auth.admin.updateUserById(user.id, {
            app_metadata: { ...user.app_metadata, role: correctRole },
          });
        } else if (existing.role !== correctRole) {
          // Whitelist changed since last login — sync.
          await admin
            .from("user_profiles")
            .update({ role: correctRole })
            .eq("id", user.id);
          await admin.auth.admin.updateUserById(user.id, {
            app_metadata: { ...user.app_metadata, role: correctRole },
          });
        }
      }

      // Post-auth redirect : ?next= wins (relative paths only), else send
      // the user straight to their role's dashboard. Without this fallback,
      // authenticated users land on the marketing page and have no obvious
      // way to enter the product.
      const next = searchParams.get("next");
      let destination: string;
      if (next && next.startsWith("/")) {
        destination = next;
      } else if (finalRole === "teacher") {
        destination = "/school";
      } else {
        destination = "/student";
      }
      return NextResponse.redirect(origin + destination);
    }
  }

  return NextResponse.redirect(origin + "/?error=auth");
}
