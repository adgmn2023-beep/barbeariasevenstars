import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { privilegedDb } from "@/lib/supabase/server";
import { statusSchema, readableError } from "@/lib/validation";
import { canTransition, dateLabel, timeLabel } from "@/lib/schedule";
import { sendPush } from "@/lib/push";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const id = z.uuid().parse((await params).id);
    const body = statusSchema.parse(await request.json());
    const db = privilegedDb();
    const { data: old, error: readError } = await db
      .from("appointments")
      .select("*")
      .eq("id", id)
      .single();
    if (readError) throw readError;
    if (!canTransition(old.status, body.status, old.end_at))
      throw new Error(
        "Mudança de status não permitida. Aguarde o fim do atendimento para concluir ou marcar falta.",
      );
    const { data, error } = await db
      .from("appointments")
      .update({
        status: body.status,
        cancel_reason: body.status === "cancelado" ? body.cancel_reason : null,
      })
      .eq("id", id)
      .eq("status", old.status)
      .select()
      .single();
    if (error) throw error;
    let pushWarning = false;
    if (
      data.client_id &&
      (body.status === "confirmado" || body.status === "cancelado")
    ) {
      const message =
        body.status === "confirmado"
          ? `Seu agendamento de ${data.service_name} em ${dateLabel(data.start_at)} às ${timeLabel(data.start_at)} foi confirmado.`
          : `Seu agendamento de ${data.service_name} foi cancelado. Motivo: ${data.cancel_reason}.`;
      try {
        const result = await sendPush([data.client_id], {
          title: "Seven Stars Barbershop",
          body: message,
          url: "/meus-agendamentos",
        });
        pushWarning = result.failed > 0;
      } catch {
        console.error("Falha ao enviar atualização de agendamento por push.");
        pushWarning = true;
      }
    }
    return NextResponse.json({
      appointment: data,
      warning: pushWarning
        ? "Status atualizado, mas o push não foi entregue. O cliente pode consultar o app."
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 400 });
  }
}
