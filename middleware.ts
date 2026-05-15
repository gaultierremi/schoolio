import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";

// Paths accessible to anyone (auth or not)
// Note : /join est passé en auth-required — c'est désormais une feature
// post-login côté élève (le QR code mène à /join?code=X → si non connecté,
// /login?next=/join?code=X → après auth, retour ici).
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Session refresh — must always run before any routing logic
  let supabaseResponse = NextResponse.next({ request });
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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  function redirect(path: string) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url);
  }

  // ── Unauthenticated ────────────────────────────────────────────────────────
  if (!user) {
    if (PUBLIC_PATHS.has(pathname)) {
      return supabaseResponse;
    }
    // Auth-required routes : envoie sur /login avec ?next préservé (préserve
    // le code de classe dans /join?code=X, le slug d'une page /accueil/... etc.)
    if (
      pathname.startsWith("/accueil") ||
      pathname.startsWith("/student") ||
      pathname.startsWith("/school") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/join") ||
      pathname.startsWith("/onboarding")
    ) {
      const next = pathname + request.nextUrl.search;
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(next)}`;
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ── Authenticated ──────────────────────────────────────────────────────────
  // Rule 3: role must come from app_metadata (server-trusted), NOT user_metadata (client-mutable).
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const isStudent = appMeta.role === "student";

  // SUPER_ADMIN bypass for /admin/* — solves the founder_teachers chicken-and-egg :
  // Alex/Gaultier must be able to reach /admin/founders to seed the whitelist
  // even though their initial role is "student" (until they add themselves).
  const isSuperAdmin =
    !!user.email && (SUPER_ADMIN_EMAILS as readonly string[]).includes(user.email.toLowerCase());

  // SUPER_ADMIN bypass for all role-gated areas — see everything as a founder,
  // independent of the role assigned in the whitelist (which determines the
  // DEFAULT landing page, not the access).
  if (
    isSuperAdmin &&
    (pathname.startsWith("/admin") ||
      pathname.startsWith("/accueil") ||
      pathname.startsWith("/student") ||
      pathname.startsWith("/school"))
  ) {
    return supabaseResponse;
  }

  // Authenticated user landing on "/" → /accueil (role-aware dispatcher).
  // To see the marketing page again, log out (or use incognito).
  if (pathname === "/") {
    return redirect("/accueil");
  }

  // /accueil is role-aware via server components — both roles authorized here.
  // No additional middleware logic needed for /accueil itself.

  // Legacy role-based redirects (Sprint 0 transitional, removed in E1 once
  // /student and /school trees are fully deleted in Phase C-D).
  if (isStudent && (pathname.startsWith("/school") || pathname.startsWith("/admin"))) {
    return redirect("/accueil");
  }
  if (!isStudent && pathname.startsWith("/student")) {
    return redirect("/accueil");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/|auth/).*)",
  ],
};
