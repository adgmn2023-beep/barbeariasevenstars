import "server-only";
import { serverDb, privilegedDb } from "./supabase/server";
import { sendPush } from "./push";
export type BookingInput = {
  service_ids: string[];
  start_at: string;
  barber_id?: string | null;
};
export async function createBooking(
  db: Awaited<ReturnType<typeof serverDb>>,
  input: BookingInput,
) {
  const { data: id, error } = await db.rpc("create_appointment", {
    p_service_ids: input.service_ids,
    p_start_at: input.start_at,
    p_barber_id: input.barber_id ?? null,
  });
  if (error) throw error;
  const { data: created } = await db
    .from("appointments")
    .select("barber_id,barber_name")
    .eq("id", id)
    .single();
  // A reserva já existe: uma falha de notificação nunca deve provocar outra reserva.
  try {
    const privileged = privilegedDb();
    const { data: admins, error: adminError } = await privileged
      .from("profiles")
      .select("id")
      .in("role", ["admin", "master"]);
    if (adminError) throw adminError;
    const recipients = (admins ?? []).map((a) => a.id);
    if (created?.barber_id) {
      const { data: barber, error } = await privileged
        .from("barbers")
        .select("profile_id")
        .eq("id", created.barber_id)
        .single();
      if (error) throw error;
      if (barber) recipients.push(barber.profile_id);
    }
    await sendPush([...new Set(recipients)], {
      title: "Novo agendamento",
      body: `Há um novo agendamento com ${created?.barber_name ?? "a equipe"} aguardando confirmação.`,
      url: "/painelinterno",
    });
  } catch {
    console.error("Falha ao notificar a equipe sobre novo agendamento.");
  }
  return {
    id,
    barber_id: created?.barber_id ?? null,
    barber_name: created?.barber_name ?? null,
  };
}
