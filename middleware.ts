import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";
import { verifyPinUnlockCookie, PIN_COOKIE_NAME } from "@/lib/auth/pin-cookie";

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
    (pathname.startsWith("/admin") || pathname.startsWith("/accueil"))
  ) {
    return supabaseResponse;
  }

  // Authenticated user landing on "/" → /accueil (role-aware dispatcher).
  // To see the marketing page again, log out (or use incognito).
  if (pathname === "/") {
    return redirect("/accueil");
  }

  // Catch-all for legacy /student/* and /school/* (post-Sprint-0 deletion).
  if (pathname.startsWith("/student") || pathname.startsWith("/school")) {
    return redirect("/accueil");
  }

  // ── PIN re-auth check (Sprint 1A) ───────────────────────────────────────────
  // Architecture : cookie HttpOnly signé maia_pin_unlocked porte la fraîcheur
  // du dernier unlock. Le middleware lit juste ce cookie (0 DB, 0 bcrypt).
  // app_metadata.has_pin (set par /api/auth/pin/setup, cleared par DELETE)
  // indique si le user a déjà configuré son PIN.
  //
  // Exclusions (le check PIN ne s'applique PAS à ces paths) :
  // - /onboarding/* : le user est en train de setup son PIN, ne pas boucler
  // - /legal/* : pages publiques (CGU, confidentialité, etc.), accessibles
  //   même avant unlock
  // - /join, /admin : restent gardés par leurs propres logiques
  //
  // Les chemins /auth/* et /api/* sont déjà exclus par le matcher en bas du fichier.
  const isPinGatedPath =
    pathname.startsWith("/accueil") ||
    (pathname.startsWith("/admin") && !isSuperAdmin);

  if (isPinGatedPath) {
    const hasPin = appMeta.has_pin === true;
    const nextQuery = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;

    if (!hasPin) {
      // Premier login post-SSO sans PIN encore configuré → setup
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/pin-setup";
      url.search = nextQuery;
      return NextResponse.redirect(url);
    }

    // Has PIN → verifier le cookie de fraîcheur
    const cookieToken = request.cookies.get(PIN_COOKIE_NAME)?.value;
    const cookieClaims = cookieToken
      ? await verifyPinUnlockCookie(cookieToken)
      : null;

    if (!cookieClaims || cookieClaims.userId !== user.id) {
      // Cookie absent, expiré, ou pour un autre user (rotation auth) → unlock
      const url = request.nextUrl.clone();
      url.pathname = "/auth/pin-unlock";
      url.search = nextQuery;
      return NextResponse.redirect(url);
    }
  }

  void isStudent; // app_metadata.role still read above for future role logic
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/|auth/).*)",
  ],
};
