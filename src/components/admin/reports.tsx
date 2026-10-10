"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { browserDb } from "@/lib/supabase/client";
import type { Appointment, Profile } from "@/lib/types";
import { localDate, money, statusLabels } from "@/lib/schedule";
import { readableError } from "@/lib/validation";
export async function allRows<T>(table: string, columns: string): Promise<T[]> {
  const db = browserDb();
  const result: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    result.push(...(data as unknown as T[]));
    if (data.length < 1000) return result;
  }
}
export function Clients() {
  const [credential, setCredential] = useState<{
    name: string;
    password: string;
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const credentialsDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (credential) credentialsDialog.current?.showModal();
  }, [credential]);
  async function resetPassword(client: Profile) {
    if (
      !window.confirm(
        `Redefinir a senha de ${client.nome}? A senha atual deixará de funcionar.`,
      )
    )
      return;
    setResetting(true);
    setError("");
    setCredential(null);
    try {
      const response = await fetch(`/api/admin/clientes/${client.id}/senha`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCredential({
        name: client.nome,
        password: result.provisionalPassword,
      });
    } catch (error) {
      setError(readableError(error));
    } finally {
      setResetting(false);
    }
  }
  const [clients, setClients] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      try {
        const [p, a] = await Promise.all([
          allRows<Profile>("profiles", "*"),
          allRows<Pick<Appointment, "client_id">>(
            "appointments",
            "id,client_id",
          ),
        ]);
        setClients(p.filter((p) => p.role === "client"));
        const c: Record<string, number> = {};
        a.forEach((a) => {
          if (a.client_id) c[a.client_id] = (c[a.client_id] ?? 0) + 1;
        });
        setCounts(c);
      } catch (e) {
        setError(readableError(e));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);
  const filtered = clients.filter((p) =>
    `${p.nome} ${p.telefone} ${p.email}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <>
      <h2>Clientes</h2>
      <label className="section-head">
        Buscar por nome, telefone ou e-mail
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente"
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando clientes…</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Agendamentos</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>{p.telefone ?? "Não informado"}</td>
                  <td>
                    {p.email.endsWith("@clientes.sevenstars.invalid")
                      ? "Acesso por telefone"
                      : p.email}
                  </td>
                  <td>{counts[p.id] ?? 0}</td>
                  <td>
                    <button
                      className="button outline"
                      disabled={resetting}
                      onClick={() => resetPassword(p)}
                    >
                      Redefinir senha
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="empty">Nenhum cliente encontrado.</p>
          )}
        </div>
      )}
      <dialog
        ref={credentialsDialog}
        className="card cancel-dialog"
        onClose={() => setCredential(null)}
      >
        {credential && (
          <>
            <h2>Senha provisória de {credential.name}</h2>
            <p>
              Exibida somente agora. Entregue ao cliente; ele deverá alterá-la
              no próximo acesso.
            </p>
            <output className="provisional-password">
              {credential.password}
            </output>
            <button
              className="button"
              onClick={() => {
                credentialsDialog.current?.close();
                setCredential(null);
              }}
            >
              Já anotei, fechar
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
export function Dashboard() {
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [items, setItems] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<
    { id: string; display_name: string; active: boolean }[]
  >([]);
  const [barberId, setBarberId] = useState("");
  const [clients, setClients] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (from > to)
        throw new Error("A data inicial deve ser anterior à final.");
      const db = browserDb();
      const all: Appointment[] = [];
      for (let offset = 0; ; offset += 1000) {
        let query = db
          .from("appointments")
          .select("*,appointment_services(*)")
          .gte("booking_date", from)
          .lte("booking_date", to);
        if (barberId) query = query.eq("barber_id", barberId);
        const { data, error } = await query
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const { count, error } = await db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "client");
      if (error) throw error;
      setItems(all);
      setClients(count ?? 0);
      setError("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, barberId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void browserDb()
      .from("barbers")
      .select("id,display_name,active")
      .order("display_name")
      .then(({ data, error }) => {
        if (error) setError(readableError(error));
        else setBarbers(data ?? []);
      });
  }, []);
  function shortcut(days: number) {
    const today = localDate();
    const d = new Date(`${today}T12:00:00-03:00`);
    if (days === 0) d.setUTCDate(1);
    else d.setUTCDate(d.getUTCDate() - days + 1);
    setFrom(localDate(d));
    setTo(today);
  }
  const completed = items.filter((a) => a.status === "concluido");
  const snapshotRevenue = (a: Appointment) =>
    (a.appointment_services ?? []).reduce(
      (sum, service) => sum + Math.round(Number(service.price) * 100),
      0,
    ) / 100;
  const revenue = completed.reduce((sum, a) => sum + snapshotRevenue(a), 0);
  const status = Object.entries(statusLabels).map(([key, name]) => ({
    name,
    total: items.filter((a) => a.status === key).length,
  }));
  const services = Object.entries(
    items.reduce<Record<string, number>>((acc, a) => {
      for (const service of a.appointment_services ?? [])
        acc[service.name] = (acc[service.name] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const daily = Object.entries(
    completed.reduce<Record<string, number>>((acc, a) => {
      acc[a.booking_date] = (acc[a.booking_date] ?? 0) + snapshotRevenue(a);
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, total]) => ({
      name: name.split("-").reverse().slice(0, 2).join("/"),
      total,
    }));
  return (
    <>
      <h2>Dashboard</h2>
      <div className="row section-head">
        <label>
          Barbeiro
          <select
            value={barberId}
            onChange={(event) => setBarberId(event.target.value)}
          >
            <option value="">Todos</option>
            {barbers.map((barber) => (
              <option key={barber.id} value={barber.id}>
                {barber.display_name}
                {barber.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {[
          [1, "Hoje"],
          [7, "7 dias"],
          [30, "30 dias"],
          [0, "Mês atual"],
        ].map(([days, label]) => (
          <button
            className="button outline"
            key={label}
            onClick={() => shortcut(Number(days))}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Calculando indicadores…</p>
      ) : (
        <>
          <div className="stats-grid">
            <div className="card stat">
              <span>Clientes cadastrados</span>
              <strong>{clients}</strong>
              <span>Total da barbearia</span>
            </div>
            <div className="card stat">
              <span>Agendamentos</span>
              <strong>{items.length}</strong>
              <span>No período</span>
            </div>
            <div className="card stat">
              <span>Atendimentos concluídos</span>
              <strong>{completed.length}</strong>
              <span>No período</span>
            </div>
            <div className="card stat">
              <span>Receita realizada</span>
              <strong>{money(revenue)}</strong>
              <span>Somente concluídos</span>
            </div>
          </div>
          {!items.length ? (
            <p className="card empty" style={{ marginTop: 24 }}>
              Nenhum agendamento no período selecionado.
            </p>
          ) : (
            <>
              <div className="two-columns" style={{ marginTop: 24 }}>
                <section className="card">
                  <h3>Agendamentos por status</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={status}>
                      <CartesianGrid stroke="#3A322E" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#A89C93", fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fill: "#A89C93" }} />
                      <Tooltip
                        contentStyle={{
                          background: "#211b17",
                          borderColor: "#3A322E",
                          color: "#F5EFE8",
                        }}
                      />
                      <Bar
                        dataKey="total"
                        name="Agendamentos"
                        fill="#C8691A"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
                <section className="card">
                  <h3>Receita por dia</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={daily}>
                      <CartesianGrid stroke="#3A322E" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#A89C93", fontSize: 10 }}
                      />
                      <YAxis tick={{ fill: "#A89C93" }} />
                      <Tooltip
                        contentStyle={{
                          background: "#211b17",
                          borderColor: "#3A322E",
                        }}
                        formatter={(value) => money(Number(value))}
                      />
                      <Line
                        dataKey="total"
                        name="Receita"
                        stroke="#E8B923"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </section>
              </div>
              <section className="card" style={{ marginTop: 24 }}>
                <h3>Serviços mais agendados</h3>
                <p className="muted">
                  Contagem de reservas no período, incluindo todos os status.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Serviço</th>
                      <th>Reservas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.name}>
                        <td>{s.name}</td>
                        <td>{s.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
