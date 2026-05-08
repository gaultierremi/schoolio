import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called before any routing logic
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const isStudent = meta.role === "student";

  function redirect(path: string) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url);
  }

  if (isAuthenticated) {
    // Students cannot access teacher/admin areas
    if (
      isStudent &&
      (pathname.startsWith("/school") || pathname.startsWith("/admin"))
    ) {
      return redirect("/student");
    }

    // Teachers/admins cannot access student area
    if (!isStudent && pathname.startsWith("/student")) {
      return redirect("/school");
    }

    // Root redirect based on role
    if (pathname === "/") {
      return redirect(isStudent ? "/student" : "/school");
    }
  } else {
    // Unauthenticated users cannot access protected areas
    if (pathname.startsWith("/student")) {
      return redirect("/");
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/|auth/).*)",
  ],
};
