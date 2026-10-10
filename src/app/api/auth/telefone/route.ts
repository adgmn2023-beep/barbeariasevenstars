import { NextResponse } from "next/server";
import { z } from "zod";
import { serverDb, privilegedDb } from "@/lib/supabase/server";
import { phoneLoginSchema, technicalEmail } from "@/lib/phone-auth";
import { enforceAuthRateLimit, AuthRequestError } from "@/lib/auth-rate-limit";
export async function POST(request: Request) {
  try {
    await enforceAuthRateLimit(request, "login");
    const input = phoneLoginSchema.parse(await request.json());
    const privileged = privilegedDb();
    const { data: profiles, error } = await privileged.rpc(
      "find_client_by_phone",
      { p_phone: input.telefone },
    );
    if (error)
      throw new AuthRequestError(
        "Não foi possível entrar. Tente novamente em instantes.",
        503,
      );
    if (profiles?.length > 1)
      throw new AuthRequestError(
        "Há mais de um cadastro com este telefone. Fale com a barbearia para recuperar o acesso.",
      );
    // Contas anteriores continuam acessíveis, sem expor o e-mail ao navegador.
    const email = profiles?.[0]?.email ?? technicalEmail(input.telefone);
    const db = await serverDb();
    const { data, error: loginError } = await db.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (loginError || !data.user)
      throw new AuthRequestError("Telefone ou senha incorretos.", 401);
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .single();
    if (profileError)
      throw new AuthRequestError(
        "Não foi possível carregar seu cadastro.",
        503,
      );
    return NextResponse.json(
      { ok: true, must_change_password: !!profile?.must_change_password },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues[0].message
            : error instanceof AuthRequestError
              ? error.message
              : "Não foi possível entrar. Tente novamente.",
      },
      {
        status: error instanceof AuthRequestError ? error.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
