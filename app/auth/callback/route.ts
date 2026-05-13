import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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

  if (!code) {
    return NextResponse.redirect(origin + "/?error=missing_code");
  }

  // Pattern from Supabase SSR docs : rebuild the response inside setAll so
  // cookies issued by exchangeCodeForSession are attached to the final
  // redirect. Using cookies() from next/headers proved unreliable when the
  // callback also runs admin operations between exchange and redirect.
  let response = NextResponse.redirect(origin + "/");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.redirect(origin + "/");
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(origin + "/?error=exchange");
  }

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
      const rawName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email.split("@")[0];
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

  // Determine final destination
  const next = searchParams.get("next");
  let destination: string;
  if (next && next.startsWith("/")) {
    destination = next;
  } else if (finalRole === "teacher") {
    destination = "/school";
  } else {
    destination = "/student";
  }

  // Mutate the existing response's Location header instead of building a new
  // response + copying cookies. Copying ResponseCookies via getAll()+set() was
  // dropping the auth cookies (Supabase chunks large session payloads across
  // sb-*-auth-token.0, .1, .2 cookies — the copy was lossy). Mutating the
  // existing response preserves ALL Set-Cookie headers exactly as Supabase
  // wrote them.
  response.headers.set("location", origin + destination);
  return response;
}
