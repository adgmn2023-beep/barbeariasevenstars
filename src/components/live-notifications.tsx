"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { browserDb, configured } from "@/lib/supabase/client";
import { dateLabel, timeLabel } from "@/lib/schedule";
import type { Appointment } from "@/lib/types";
export function LiveNotifications() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!configured()) return;
    const db = browserDb();
    let channel: ReturnType<typeof db.channel> | null = null;
    let disposed = false;
    async function listen() {
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user || disposed) return;
      if (channel) void db.removeChannel(channel);
      channel = db
        .channel("client-toast")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "appointments",
            filter: `client_id=eq.${user.id}`,
          },
          (payload) => {
            const a = payload.new as Appointment;
            if (a.status === "confirmado")
              setMessage(
                `Seu agendamento de ${a.service_name} em ${dateLabel(a.start_at)} às ${timeLabel(a.start_at)} foi confirmado.`,
              );
            if (a.status === "cancelado")
              setMessage(
                `Seu agendamento de ${a.service_name} foi cancelado. Motivo: ${a.cancel_reason}.`,
              );
          },
        )
        .subscribe();
    }
    void listen();
    window.addEventListener("seven-auth-changed", listen);
    return () => {
      window.removeEventListener("seven-auth-changed", listen);
      disposed = true;
      if (channel) void db.removeChannel(channel);
    };
  }, []);
  return message ? (
    <div className="toast" role="status">
      <button
        className="quiet"
        aria-label="Fechar aviso"
        onClick={() => setMessage("")}
      >
        ×
      </button>
      <p>{message}</p>
      <Link href="/meus-agendamentos">Ver agendamentos</Link>
    </div>
  ) : null;
}
