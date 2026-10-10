"use client";
import { useEffect, useState } from "react";
import { browserDb } from "@/lib/supabase/client";
import type { Hours, Settings as SettingsType } from "@/lib/types";
import { readableError } from "@/lib/validation";
import { hoursSchema, settingsSchema } from "@/lib/admin-validation";
import { adminRequest } from "./catalog";
const days = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export function Settings() {
  const [hours, setHours] = useState<Hours[]>([]);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    async function load() {
      try {
        const db = browserDb();
        const [h, s] = await Promise.all([
          db.from("business_hours").select("*").order("weekday"),
          db.from("settings").select("*").eq("id", 1).single(),
        ]);
        if (h.error || s.error) throw h.error ?? s.error;
        setHours(h.data ?? []);
        setSettings(s.data);
      } catch (e) {
        setError(readableError(e));
      }
    }
    void load();
  }, []);
  async function save(e: React.FormEvent<HTMLFormElement>, day?: number) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      if (day !== undefined)
        await adminRequest(
          "business_hours",
          hoursSchema.parse({
            ...f,
            weekday: day,
            closed: f.closed === "on",
            lunch_start: f.lunch_start || null,
            lunch_end: f.lunch_end || null,
          }),
        );
      else await adminRequest("settings", settingsSchema.parse(f));
      setMessage(
        "Configurações salvas. As reservas existentes foram preservadas.",
      );
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Configurações da agenda</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {!settings && !error ? (
        <p role="status">Carregando configurações…</p>
      ) : (
        <>
          <section className="card">
            <h3>Horário de funcionamento</h3>
            <p className="muted">
              Fuso de Brasília. Deixe os dois campos de almoço vazios para não
              aplicar intervalo.
            </p>
            {hours.map((h) => (
              <form
                className="settings-row"
                key={h.weekday}
                onSubmit={(e) => save(e, h.weekday)}
              >
                <label>
                  {days[h.weekday]}
                  <span className="check">
                    <input
                      type="checkbox"
                      name="closed"
                      defaultChecked={h.closed}
                    />
                    Fechado
                  </span>
                </label>
                <label>
                  Abertura
                  <input
                    type="time"
                    name="opens"
                    defaultValue={h.opens.slice(0, 5)}
                    required
                  />
                </label>
                <label>
                  Encerramento
                  <input
                    type="time"
                    name="closes"
                    defaultValue={h.closes.slice(0, 5)}
                    required
                  />
                </label>
                <label>
                  Início almoço
                  <input
                    type="time"
                    name="lunch_start"
                    defaultValue={h.lunch_start?.slice(0, 5)}
                  />
                </label>
                <label>
                  Fim almoço
                  <input
                    type="time"
                    name="lunch_end"
                    defaultValue={h.lunch_end?.slice(0, 5)}
                  />
                </label>
                <button className="button outline" disabled={busy}>
                  Salvar
                </button>
              </form>
            ))}
          </section>
          {settings && (
            <section className="card" style={{ marginTop: 24 }}>
              <h3>Regras de reserva</h3>
              <form onSubmit={save}>
                <label>
                  Passo da grade (minutos)
                  <input
                    type="number"
                    name="slot_step"
                    min="5"
                    max="120"
                    defaultValue={settings.slot_step}
                    required
                  />
                </label>
                <label>
                  Antecedência mínima (minutos)
                  <input
                    type="number"
                    name="min_notice"
                    min="0"
                    max="10080"
                    defaultValue={settings.min_notice}
                    required
                  />
                </label>
                <label>
                  Janela de agendamento (dias)
                  <input
                    type="number"
                    name="booking_window"
                    min="1"
                    max="365"
                    defaultValue={settings.booking_window}
                    required
                  />
                </label>
                <button className="button" disabled={busy}>
                  Salvar regras
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </>
  );
}
