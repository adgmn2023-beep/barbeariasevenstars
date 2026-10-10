import { NextResponse } from "next/server";
import { serverDb, privilegedDb } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";
import { bookingSchema, readableError } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const body = bookingSchema.parse(await request.json());
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Entre na sua conta para agendar." },
        { status: 401 },
      );
    const { data, error } = await db.rpc("create_appointment", {
      p_service_id: body.service_id,
      p_start_at: body.start_at,
      p_barber_id: body.barber_id ?? null,
    });
    if (error) throw error;
    const { data: created, error: createdError } = await db
      .from("appointments")
      .select("barber_id,barber_name")
      .eq("id", data)
      .single();
    if (createdError) throw createdError;
    try {
      const privileged = privilegedDb();
      const [{ data: admins, error: adminError }, { data: barber, error: barberError }] =
        await Promise.all([
          privileged
        .from("profiles")
        .select("id")
            .in("role", ["admin", "master"]),
          privileged
            .from("barbers")
            .select("profile_id")
            .eq("id", created.barber_id)
            .single(),
        ]);
      if (adminError || barberError) throw adminError ?? barberError;
      const recipientIds = [
        ...(admins ?? []).map((admin) => admin.id),
        barber.profile_id,
      ];
      await sendPush(
        [...new Set(recipientIds)],
        {
          title: "Novo agendamento",
          body: `Há um novo agendamento com ${created.barber_name ?? "a equipe"} aguardando confirmação.`,
          url: "/painelinterno",
        },
      );
    } catch {
      console.error(
        "Falha ao notificar administradores sobre novo agendamento.",
      );
    }
    return NextResponse.json(
      { id: data, barber_id: created.barber_id, barber_name: created.barber_name },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 400 });
  }
}
