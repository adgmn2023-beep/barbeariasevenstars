import { NextResponse } from "next/server";
import { z } from "zod";
import { serverDb, privilegedDb } from "@/lib/supabase/server";
import {
  quickSignupSchema,
  technicalEmail,
  PHONE_EXISTS_MESSAGE,
} from "@/lib/phone-auth";
import { bookingSchema, readableError } from "@/lib/validation";
import { enforceAuthRateLimit, AuthRequestError } from "@/lib/auth-rate-limit";
import { createBooking } from "@/lib/booking-server";
const schema = quickSignupSchema.extend({ booking: bookingSchema.optional() });
export async function POST(request: Request) {
  try {
    await enforceAuthRateLimit(request, "signup");
    const input = schema.parse(await request.json());
    const privileged = privilegedDb();
    const { data: existing, error: lookupError } = await privileged.rpc(
      "find_client_by_phone",
      { p_phone: input.telefone },
    );
    if (lookupError)
      throw new AuthRequestError(
        "Não foi possível verificar seu cadastro. Tente novamente.",
        503,
      );
    if (existing?.length)
      throw new AuthRequestError(PHONE_EXISTS_MESSAGE, 409, "PHONE_EXISTS");
    const email = technicalEmail(input.telefone);
    // Lista explícita de metadados: password jamais é copiada para perfil/metadados/logs.
    const { data: created, error } = await privileged.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        nome: input.nome,
        telefone: input.telefone,
        privacy_accepted: true,
      },
    });
    if (error || !created.user) {
      if (
        error &&
        ["email_exists", "user_already_exists"].includes(error.code ?? "")
      )
        throw new AuthRequestError(PHONE_EXISTS_MESSAGE, 409, "PHONE_EXISTS");
      throw new AuthRequestError(
        "Não foi possível criar sua conta. Verifique os dados e tente novamente.",
      );
    }
    const db = await serverDb();
    const { error: loginError } = await db.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (loginError)
      return NextResponse.json(
        {
          account_created: true,
          error: "Conta criada. Entre com seu telefone e senha para concluir.",
          code: "LOGIN_REQUIRED",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    if (input.booking) {
      try {
        const appointment = await createBooking(db, input.booking);
        return NextResponse.json(
          { account_created: true, appointment },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        return NextResponse.json(
          {
            account_created: true,
            appointment: null,
            booking_error: readableError(error),
          },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    return NextResponse.json(
      { account_created: true },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof AuthRequestError ? error.status : 400;
    const message =
      error instanceof z.ZodError
        ? error.issues[0].message
        : error instanceof AuthRequestError
          ? error.message
          : "Não foi possível concluir o cadastro. Tente novamente.";
    return NextResponse.json(
      {
        error: message,
        code: error instanceof AuthRequestError ? error.code : "INVALID_INPUT",
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(status === 429 ? { "Retry-After": "900" } : {}),
        },
      },
    );
  }
}
