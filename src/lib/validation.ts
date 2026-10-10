import { z } from "zod";
import { phoneSchema } from "./phone-auth";
z.config(z.locales.pt());
export const profileSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome completo.").max(120),
  telefone: phoneSchema,
  privacy_accepted: z.literal(true, {
    error: "Aceite a política de privacidade.",
  }),
});
export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});
export const bookingSchema = z
  .object({
    service_id: z.uuid("Serviço inválido.").optional(),
    service_ids: z
      .array(z.uuid("Serviço inválido."))
      .min(1, "Escolha pelo menos um serviço.")
      .max(20, "Escolha no máximo 20 serviços.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Selecione serviços diferentes.",
      )
      .optional(),
    start_at: z.iso.datetime({ offset: true, error: "Horário inválido." }),
    barber_id: z.uuid("Barbeiro inválido.").nullable().optional(),
  })
  .refine(
    (value) => !!value.service_ids?.length || !!value.service_id,
    "Escolha pelo menos um serviço.",
  )
  .transform(({ service_id, service_ids, ...rest }) => ({
    ...rest,
    service_ids: service_ids ?? [service_id!],
  }));
export const statusSchema = z
  .object({
    status: z.enum(["confirmado", "cancelado", "concluido", "faltou"]),
    cancel_reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => v.status !== "cancelado" || (v.cancel_reason?.length ?? 0) >= 3,
    { message: "Informe um motivo com pelo menos 3 caracteres." },
  );
export function readableError(error: unknown) {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (code === "invalid_credentials" || message.includes("Invalid login"))
    return "E-mail ou senha incorretos.";
  if (message.includes("Email not confirmed"))
    return "Confirme seu e-mail antes de entrar.";
  if (message.includes("already registered"))
    return "Este e-mail já está cadastrado.";
  if (message.includes("rate limit"))
    return "Muitas tentativas. Aguarde alguns minutos.";
  if (code === "23505") return "Este registro já existe.";
  if (code === "23P01")
    return "Esse horário acabou de ser ocupado, escolha outro.";
  if (code === "P0001" || /[ãõçáéíóúê]/i.test(message)) return message;
  return "Não foi possível concluir. Verifique sua conexão e tente novamente.";
}
export function safeNext(value: string | null) {
  if (
    !value?.startsWith("/") ||
    value.includes("\\") ||
    [...value].some((char) => char.charCodeAt(0) <= 32)
  )
    return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid"
      ? url.pathname + url.search + url.hash
      : "/";
  } catch {
    return "/";
  }
}
