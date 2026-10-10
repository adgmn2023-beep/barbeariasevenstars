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
    });
    if (error) throw error;
    try {
      const { data: admins, error: adminError } = await privilegedDb()
        .from("profiles")
        .select("id")
        .eq("role", "admin");
      if (adminError) throw adminError;
      await sendPush(
        (admins ?? []).map((a) => a.id),
        {
          title: "Novo agendamento",
          body: "Há um novo agendamento aguardando confirmação.",
          url: "/painelinterno",
        },
      );
    } catch {
      console.error(
        "Falha ao notificar administradores sobre novo agendamento.",
      );
    }
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 400 });
  }
}
