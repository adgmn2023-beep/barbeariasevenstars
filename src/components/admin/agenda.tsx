"use client";
import { useCallback, useEffect, useState } from "react";
import { browserDb } from "@/lib/supabase/client";
import type { Appointment } from "@/lib/types";
import { localDate } from "@/lib/schedule";
import { readableError } from "@/lib/validation";
import { AppointmentCard } from "./appointment-card";
export function Agenda({ barberMode = false }: { barberMode?: boolean }) {
  const [date, setDate] = useState(localDate());
  const [week, setWeek] = useState(false);
  const [items, setItems] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<{ id: string; display_name: string; active: boolean }[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const end = new Date(`${date}T12:00:00-03:00`);
      if (week) end.setUTCDate(end.getUTCDate() + 6);
      const db = browserDb();
      let query = db
        .from("appointments")
        .select("*,profiles(*)")
        .gte("booking_date", date)
        .lte("booking_date", localDate(end));
      if (!barberMode && selectedBarberId)
        query = query.eq("barber_id", selectedBarberId);
      const { data, error } = await query.order("start_at");
      if (error) throw error;
      setItems((data ?? []) as Appointment[]);
      setError("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, [date, week, barberMode, selectedBarberId]);
  useEffect(() => {
    setLoading(true);
    void load();
    const db = browserDb();
    const channel = db
      .channel("agenda")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => void load(),
      )
      .subscribe();
    const interval = setInterval(() => void load(), 30000);
    return () => {
      clearInterval(interval);
      void db.removeChannel(channel);
    };
  }, [load]);
  useEffect(() => {
    if (barberMode) return;
    void browserDb()
      .from("barbers")
      .select("id,display_name,active")
      .order("display_name")
      .then(({ data, error }) => {
        if (error) setError(readableError(error));
        else setBarbers(data ?? []);
      });
  }, [barberMode]);
  return (
    <>
      <div className="row spaced section-head">
        <h2>Agenda</h2>
        <div className="row">
          {!barberMode && (
            <label>
              Barbeiro
              <select value={selectedBarberId} onChange={(event) => setSelectedBarberId(event.target.value)}>
                <option value="">Todos</option>
                {barbers.map((barber) => (
                  <option key={barber.id} value={barber.id}>
                    {barber.display_name}{barber.active ? "" : " (inativo)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Data
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {!barberMode && <button
            className={`button ${!week ? "" : "outline"}`}
            onClick={() => setWeek(false)}
          >
            Dia
          </button>}
          {!barberMode && <button
            className={`button ${week ? "" : "outline"}`}
            onClick={() => setWeek(true)}
          >
            7 dias
          </button>}
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando agenda…</p>
      ) : items.length ? (
        <div className="grid">
          {[...items]
            .sort(
              (a, b) =>
                Number(b.status === "pendente") -
                Number(a.status === "pendente"),
            )
            .map((a) => (
              <AppointmentCard key={a.id} item={a} onChange={load} />
            ))}
        </div>
      ) : (
        <div className="card empty">Nenhum agendamento neste período.</div>
      )}
    </>
  );
}
