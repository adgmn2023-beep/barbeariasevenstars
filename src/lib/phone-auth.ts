import { z } from "zod";
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && [12, 13].includes(digits.length)
    ? digits.slice(2)
    : digits;
}
export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine(
    (value) => /^[1-9]{2}\d{8,9}$/.test(value),
    "Informe um telefone válido com DDD.",
  );
export const clientPasswordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.");
export const quickSignupSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome completo.").max(120),
  telefone: phoneSchema,
  password: clientPasswordSchema,
  privacy_accepted: z.literal(true, {
    error: "Aceite a política de privacidade.",
  }),
});
export const phoneLoginSchema = z.object({
  telefone: phoneSchema,
  password: clientPasswordSchema,
});
export const PHONE_EXISTS_MESSAGE =
  "Esse telefone já tem conta. Entre com sua senha.";
export function technicalEmail(phone: string) {
  return `55${phoneSchema.parse(phone)}@clientes.sevenstars.invalid`;
}
export function phoneMask(value: string) {
  const d = normalizePhone(value).slice(0, 11);
  return d.length > 6
    ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`
    : d.length > 2
      ? `(${d.slice(0, 2)}) ${d.slice(2)}`
      : d;
}
