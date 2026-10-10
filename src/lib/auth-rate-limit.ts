import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { privilegedDb } from "./supabase/server";
export class AuthRequestError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "AUTH_ERROR",
  ) {
    super(message);
  }
}
export async function enforceAuthRateLimit(
  request: Request,
  purpose: "signup" | "login",
) {
  // Só confiar no cabeçalho substituído pela infraestrutura Vercel.
  const forwarded =
    process.env.VERCEL === "1"
      ? request.headers.get("x-forwarded-for")?.split(",")[0].trim()
      : null;
  const ip =
    forwarded && isIP(forwarded) ? forwarded : "shared-local-or-untrusted";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new AuthRequestError(
      "O atendimento online ainda está sendo configurado.",
      503,
    );
  const bucket = createHmac("sha256", secret)
    .update(`${purpose}:${ip}`)
    .digest("hex");
  const { data, error } = await privilegedDb().rpc("consume_auth_rate_limit", {
    p_bucket: bucket,
    p_limit: purpose === "signup" ? 5 : 15,
    p_window_seconds: 900,
  });
  if (error)
    throw new AuthRequestError(
      "Não foi possível validar esta tentativa. Tente novamente em instantes.",
      503,
    );
  if (!data)
    throw new AuthRequestError(
      "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
      429,
      "RATE_LIMITED",
    );
}
