import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  request.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith("sb-")) {
      request.cookies.delete(name);
      response.cookies.delete(name);
    }
  });
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname === "/admin/login";
  const isProtectedRoute = !isLoginRoute && (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/dueno" || pathname.startsWith("/dueno/"));

  if (!isProtectedRoute) {
    return response;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  let user = null;
  let hasAuthError = false;

  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    hasAuthError = Boolean(error);
  } catch {
    hasAuthError = true;
  }

  if (hasAuthError || !user) {
    clearSupabaseCookies(request, response);

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "?error=session";
    const redirectResponse = NextResponse.redirect(loginUrl);
    clearSupabaseCookies(request, redirectResponse);
    return redirectResponse;
  }

  return response;
}
