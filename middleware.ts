import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_EMAILS } from "@/lib/admin-config";

// Paths accessible to authenticated users even without beta clearance
const BETA_EXEMPT = new Set(["/beta-pending"]);

// Paths accessible to anyone (auth or not)
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

async function checkBetaWhitelist(email: string): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    // Check if this email is whitelisted (case-insensitive)
    const emailRes = await fetch(
      `${base}/rest/v1/beta_whitelist?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers },
    );
    if (!emailRes.ok) return true; // fail open on DB error
    const emailData = (await emailRes.json()) as unknown[];
    if (emailData.length > 0) return true;

    // Kill switch: if table is empty → let everyone through
    const anyRes = await fetch(
      `${base}/rest/v1/beta_whitelist?select=id&limit=1`,
      { headers },
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
    if (PUBLIC_PATHS.has(pathname) || BETA_EXEMPT.has(pathname)) {
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
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const isStudent = meta.role === "student";

  // /beta-pending always accessible to authenticated users
  if (BETA_EXEMPT.has(pathname)) return supabaseResponse;

  // Admins bypass the beta whitelist entirely
  const isAdmin = (ADMIN_EMAILS as readonly string[]).includes(email);

  if (!isAdmin) {
    // Check 1-hour cache cookie (keyed by email to prevent cross-account reuse)
    const cached = request.cookies.get("beta-checked")?.value;
    const betaCached = cached === email;

    if (!betaCached) {
      const allowed = await checkBetaWhitelist(email);
      if (!allowed) return redirect("/beta-pending");

      // Set cache cookie on the response
      supabaseResponse.cookies.set("beta-checked", email, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 3600,
        path: "/",
      });
    }
  }

  // Role-based redirects (unchanged from previous middleware)
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
