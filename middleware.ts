import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Paths accessible to anyone (auth or not)
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/join"]);

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
  // Rule 3: role must come from app_metadata (server-trusted), NOT user_metadata (client-mutable).
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const isStudent = appMeta.role === "student";

  // Role-based redirects
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
