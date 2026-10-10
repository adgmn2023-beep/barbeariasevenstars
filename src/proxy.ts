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
  if (protectedPage && !user)
    target = `/login?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  if (user && request.nextUrl.pathname.startsWith("/painelinterno")) {
    const { data } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (data?.role !== "admin") target = "/";
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
