import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_EMAILS } from "@/lib/admin-config";
import {
  signBetaCookie,
  verifyBetaCookie,
  BETA_COOKIE_MAX_AGE,
} from "@/lib/api/beta-cookie";

// Paths or path prefixes accessible to authenticated users even without
// beta clearance. Use prefix matching: "/join" covers "/join/[token]" too.
const BETA_EXEMPT_PREFIXES = ["/beta-pending", "/join"];

// Paths accessible to anyone (auth or not). Exact match.
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  for (const p of prefixes) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

async function checkBetaWhitelist(email: string): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    // Exact lookup by lowercased email. The unique index in the migration is
    // on LOWER(email), so eq is the correct PostgREST filter (and avoids the
    // ilike wildcard-injection surface).
    const lower = email.toLowerCase();
    const emailRes = await fetch(
      `${base}/rest/v1/beta_whitelist?select=id&email=eq.${encodeURIComponent(lower)}&limit=1`,
      { headers, cache: "no-store" },
    );
    if (!emailRes.ok) return true; // fail open on DB error
    const emailData = (await emailRes.json()) as unknown[];
    if (emailData.length > 0) return true;

    // Kill switch: if table is empty → let everyone through.
    const anyRes = await fetch(
      `${base}/rest/v1/beta_whitelist?select=id&limit=1`,
      { headers, cache: "no-store" },
    );
    if (!anyRes.ok) return true;
    const anyData = (await anyRes.json()) as unknown[];
    return anyData.length === 0;
  } catch {
    return true; // fail open on network error
  }
}

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
    if (PUBLIC_PATHS.has(pathname) || matchesPrefix(pathname, BETA_EXEMPT_PREFIXES)) {
      return supabaseResponse;
    }
    if (
      pathname.startsWith("/student") ||
      pathname.startsWith("/school") ||
      pathname.startsWith("/admin")
    ) {
      return redirect("/");
    }
    return supabaseResponse;
  }

  // ── Authenticated ──────────────────────────────────────────────────────────
  const email = user.email?.toLowerCase() ?? "";
  // Read role from app_metadata (only writable by service role) and fall back
  // to user_metadata for accounts created before the role migration.
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const role = (appMeta.role ?? userMeta.role) as string | undefined;
  const isStudent = role === "student";

  // /beta-pending and /join (incl. token sub-paths) always accessible to
  // authenticated users — they're how a user resolves the beta gate.
  if (matchesPrefix(pathname, BETA_EXEMPT_PREFIXES)) return supabaseResponse;

  // Admins bypass the beta whitelist entirely
  const isAdmin = (ADMIN_EMAILS as readonly string[]).includes(email);

  if (!isAdmin) {
    // Verify the signed cookie. Verification fails if BETA_COOKIE_SECRET
    // isn't set, which is fail-closed: every request hits the DB check
    // until the secret is configured.
    const cookieVal = request.cookies.get("beta-checked")?.value;
    const betaCached = verifyBetaCookie(cookieVal, email);

    if (!betaCached) {
      const allowed = await checkBetaWhitelist(email);
      if (!allowed) return redirect("/beta-pending");

      // Set a signed cookie so subsequent requests skip the DB roundtrip.
      try {
        supabaseResponse.cookies.set("beta-checked", signBetaCookie(email), {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          maxAge: BETA_COOKIE_MAX_AGE,
          path: "/",
        });
      } catch {
        // BETA_COOKIE_SECRET missing — skip caching, the next request will
        // re-hit the DB check. No security impact.
      }
    }
  }

  // Role-based redirects (unchanged)
  if (isStudent && (pathname.startsWith("/school") || pathname.startsWith("/admin"))) {
    return redirect("/student");
  }
  if (!isStudent && pathname.startsWith("/student")) {
    return redirect("/school");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/|auth/).*)",
  ],
};
