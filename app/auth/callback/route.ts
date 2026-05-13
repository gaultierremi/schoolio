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

      if (user && user.email) {
        const admin = createAdminClient();

        // Check if a user_profiles row already exists
        const { data: existing } = await admin
          .from("user_profiles")
          .select("id, role, school_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!existing) {
          // First login — assign role + scope to FounderTestGround tenant
          const role = await resolveUserRole(user.email);

          // Derive a display name from Google profile (user_metadata is safe
          // for display data only — role comes from our resolver, not metadata).
          const rawName = (user.user_metadata?.full_name as string | undefined)
            ?? (user.user_metadata?.name as string | undefined)
            ?? user.email.split("@")[0];
          const userName = String(rawName).slice(0, 100);

          await admin.from("user_profiles").insert({
            id: user.id,
            role,
            school_id: FOUNDER_TENANT,
            user_name: userName,
            // All other columns have DB defaults or are nullable
          });

          // Mirror role to app_metadata (server-trusted, consumed by middleware + RLS).
          // Per CLAUDE.md rule 3: app_metadata only, never user_metadata.
          await admin.auth.admin.updateUserById(user.id, {
            app_metadata: { ...user.app_metadata, role },
          });
        } else if (!existing.role) {
          // Profile exists but role is null (edge case — repair)
          const role = await resolveUserRole(user.email);
          await admin
            .from("user_profiles")
            .update({ role })
            .eq("id", user.id);
          await admin.auth.admin.updateUserById(user.id, {
            app_metadata: { ...user.app_metadata, role },
          });
        }
      }

      // Support ?next= for post-auth redirects (must be a relative path)
      const next = searchParams.get("next");
      const destination = next && next.startsWith("/") ? next : "/";
      return NextResponse.redirect(origin + destination);
    }
  }

  return NextResponse.redirect(origin + "/?error=auth");
}
