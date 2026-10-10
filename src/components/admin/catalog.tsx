"use client";
import { useCallback, useEffect, useState } from "react";
import { browserDb } from "@/lib/supabase/client";
import type { Service, Busy } from "@/lib/types";
import { dateLabel, money, timeLabel } from "@/lib/schedule";
import { readableError } from "@/lib/validation";
import { serviceSchema, blockSchema } from "@/lib/admin-validation";
export async function adminRequest(
  resource: string,
  body: unknown,
  method = "POST",
) {
  const r = await fetch(`/api/admin/${resource}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export function Catalog() {
  const [items, setItems] = useState<Service[]>([]);
  const [edit, setEdit] = useState<Service | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const { data, error } = await browserDb()
        .from("services")
        .select("*")
        .order("name");
      if (error) throw error;
      setItems(data ?? []);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const f = Object.fromEntries(new FormData(form));
      await adminRequest("services", {
        ...serviceSchema.parse({ ...f, active: f.active === "on" }),
        id: edit?.id,
      });
      setEdit(null);
      form.reset();
      setMessage(
        "Serviço salvo. Agendamentos anteriores mantêm os valores originais.",
      );
      await load();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (
      !confirm(
        "Excluir este serviço? O histórico dos agendamentos será preservado.",
      )
    )
      return;
    setBusy(true);
    try {
      await adminRequest("services", { id }, "DELETE");
      await load();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Serviços</h2>
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
      <div className="two-columns">
        <section className="card">
          <h3>{edit ? "Editar serviço" : "Adicionar serviço"}</h3>
          <form key={edit?.id ?? "new"} onSubmit={save}>
            <label>
              Nome
              <input name="name" defaultValue={edit?.name} required />
            </label>
            <label>
              Preço (R$)
              <input
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={edit?.price ?? 0}
                required
              />
            </label>
            <label>
              Duração em minutos
              <input
                name="duration_minutes"
                type="number"
                min="5"
                max="600"
                defaultValue={edit?.duration_minutes ?? 40}
                required
              />
            </label>
            <label className="check">
              <input
                name="active"
                type="checkbox"
                defaultChecked={edit?.active ?? true}
              />
              Serviço ativo
            </label>
            <div className="row">
              <button className="button" disabled={busy}>
                {busy ? "Salvando…" : "Salvar serviço"}
              </button>
              {edit && (
                <button
                  className="button outline"
                  type="button"
                  onClick={() => setEdit(null)}
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </section>
        <section className="grid">
          {loading ? (
            <p role="status">Carregando serviços…</p>
          ) : items.length ? (
            items.map((s) => (
              <article className="card" key={s.id}>
                <div className="row spaced">
                  <h3>{s.name}</h3>
                  <span className="badge">
                    {s.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="muted">
                  {money(s.price)} · {s.duration_minutes} min
                </p>
                <div className="row">
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() => setEdit(s)}
                  >
                    Editar
                  </button>
                  <button
                    className="quiet danger"
                    disabled={busy}
                    onClick={() => remove(s.id)}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="empty">Nenhum serviço cadastrado.</p>
          )}
        </section>
      </div>
    </>
  );
}
type Block = Busy & { id: string; reason: string | null };
export function Blocks() {
  const [items, setItems] = useState<Block[]>([]);
  const [allDay, setAllDay] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const { data, error } = await browserDb()
        .from("blocked_slots")
        .select("*")
        .order("start_at", { ascending: false });
      if (error) throw error;
      setItems(data ?? []);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    try {
      const f = Object.fromEntries(new FormData(form));
      const start = new Date(
        `${f.date}T${allDay ? "00:00" : f.start}:00-03:00`,
      );
      const end = allDay
        ? new Date(start.getTime() + 86400000)
        : new Date(`${f.date}T${f.end}:00-03:00`);
      await adminRequest(
        "blocked_slots",
        blockSchema.parse({
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          reason: String(f.reason),
        }),
      );
      form.reset();
      await load();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("Remover este bloqueio e liberar o período?")) return;
    setBusy(true);
    try {
      await adminRequest("blocked_slots", { id }, "DELETE");
      await load();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Bloqueios da agenda</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="two-columns">
        <section className="card">
          <h3>Reservar um período</h3>
          <form onSubmit={save}>
            <label>
              Data
              <input type="date" name="date" required />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              Fechar o dia inteiro
            </label>
            {!allDay && (
              <div className="row">
                <label>
                  Início
                  <input name="start" type="time" required />
                </label>
                <label>
                  Fim
                  <input name="end" type="time" required />
                </label>
              </div>
            )}
            <label>
              Motivo (opcional)
              <input name="reason" maxLength={500} />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Salvando…" : "Criar bloqueio"}
            </button>
            <p className="muted">
              Bloqueios não podem sobrepor reservas existentes.
            </p>
          </form>
        </section>
        <section className="grid">
          {loading ? (
            <p role="status">Carregando bloqueios…</p>
          ) : items.length ? (
            items.map((b) => (
              <article className="card" key={b.id}>
                <h3>{dateLabel(b.start_at)}</h3>
                <p>
                  {timeLabel(b.start_at)} até {timeLabel(b.end_at)} ·{" "}
                  {dateLabel(b.end_at)}
                </p>
                <p className="muted">{b.reason || "Sem motivo informado"}</p>
                <button
                  disabled={busy}
                  className="button outline danger"
                  onClick={() => remove(b.id)}
                >
                  Remover bloqueio
                </button>
              </article>
            ))
          ) : (
            <p className="empty">Nenhum bloqueio cadastrado.</p>
          )}
        </section>
      </div>
    </>
  );
}
