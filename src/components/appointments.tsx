"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { browserDb } from "@/lib/supabase/client";
import { dateLabel, money, statusLabels, timeLabel } from "@/lib/schedule";
import { readableError } from "@/lib/validation";
import type { Appointment } from "@/lib/types";
export function Appointments() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const db = browserDb();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) {
        location.assign("/login?next=/meus-agendamentos");
        return;
      }
      const { data, error } = await db
        .from("appointments")
        .select("*")
        .eq("client_id", user.id)
        .order("start_at", { ascending: false });
      if (error) throw error;
      setItems(data ?? []);
      setError("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const db = browserDb();
    const channel = db
      .channel("my-appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => void load(),
      )
      .subscribe();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      void db.removeChannel(channel);
      clearInterval(timer);
    };
  }, [load]);
  return (
    <>
      <p className="eyebrow">SEU TEMPO, RESERVADO</p>
      <div className="row spaced section-head">
        <h1>Meus agendamentos</h1>
        <Link href="/" className="button">
          Novo agendamento
        </Link>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
          <button className="quiet" onClick={load}>
            Tentar novamente
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Carregando agendamentos…</p>
      ) : items.length ? (
        <div className="grid">
          {items.map((a) => (
            <article className="card" key={a.id}>
              <div className="row spaced">
                <h2>{a.service_name}</h2>
                <span className={`badge status-${a.status}`}>
                  {statusLabels[a.status]}
                </span>
              </div>
              <p>
                {dateLabel(a.start_at)} às {timeLabel(a.start_at)}
              </p>
              <p className="muted">
                {a.duration_minutes} minutos · {money(a.price)}
              </p>
              {a.status === "cancelado" && (
                <p className="error">
                  Motivo do cancelamento: {a.cancel_reason}
                </p>
              )}
              {a.status === "pendente" && (
                <p className="muted">
                  Aguardando confirmação da barbearia. Seu horário já está
                  reservado.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="card empty">
          <h2>Seu próximo corte está te esperando</h2>
          <p>Você ainda não tem agendamentos.</p>
          <Link className="button" href="/">
            Escolher um serviço
          </Link>
        </div>
      )}
    </>
  );
}
