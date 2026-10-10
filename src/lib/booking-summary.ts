import type { Service } from "./types";
export function summarizeServices(
  services: Pick<Service, "price" | "duration_minutes">[],
) {
  return {
    price:
      services.reduce((sum, s) => sum + Math.round(Number(s.price) * 100), 0) /
      100,
    duration_minutes: services.reduce((sum, s) => sum + s.duration_minutes, 0),
    count: services.length,
  };
}
export const BOOKING_SUCCESS_MESSAGE =
  "Seu agendamento já foi encaminhado e notificado a nossa equipe, em breve você receberá a confirmação do seu agendamento por aqui, fique de olho e obrigado pela preferência!";
