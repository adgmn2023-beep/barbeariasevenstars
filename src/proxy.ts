import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method)
  ) {
    const origin = request.headers.get("origin");
    const expected = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    if (origin && origin !== request.nextUrl.origin && origin !== expected)
      return NextResponse.json(
        { error: "Origem da solicitação não permitida." },
        { status: 403 },
      );
  }
  let response = NextResponse.next({ request });
  const protectedPage = [
    "/painelinterno",
    "/perfil",
    "/meus-agendamentos",
    "/completar-cadastro",
    "/trocar-senha",
  ].some((p) => request.nextUrl.pathname.startsWith(p));
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return protectedPage
      ? NextResponse.redirect(new URL("/login", request.url))
      : response;
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const {
    data: { user },
  } = await db.auth.getUser();
  let target: string | undefined;
  let role: string | undefined;
  if (protectedPage && !user)
    target = `/login?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  if (user) {
    const { data } = await db
      .from("profiles")
      .select("role,must_change_password")
      .eq("id", user.id)
      .single();
    role = data?.role;
    const path = request.nextUrl.pathname;
    const passwordFlow =
      path === "/trocar-senha" || path === "/api/conta/trocar-senha";
    if (data?.must_change_password && !passwordFlow)
      target = `/trocar-senha?required=1&next=${encodeURIComponent(path + request.nextUrl.search)}`;
    if (path.startsWith("/painelinterno") && data?.role === "barber") {
      const { data: barber } = await db
        .from("barbers")
        .select("active")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (!barber?.active) target = "/";
    }
  }
  if (user && request.nextUrl.pathname.startsWith("/painelinterno")) {
    if (!role || !["barber", "admin", "master"].includes(role))
      target = "/";
  }
  if (target) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|logo.png|sw.js|manifest.webmanifest|painelinterno/manifest.webmanifest).*)",
  ],
};
