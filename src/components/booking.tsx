"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Scissors,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { browserDb, configured } from "@/lib/supabase/client";
import {
  availableSlotsForAnyBarber,
  localDate,
  money,
  timeLabel,
} from "@/lib/schedule";
import {
  summarizeServices,
  BOOKING_SUCCESS_MESSAGE,
} from "@/lib/booking-summary";
import type { Service, Hours, Settings, Busy } from "@/lib/types";
import { readableError } from "@/lib/validation";
import { BookingSummary } from "./booking-summary";
import { QuickSignup } from "./quick-signup";
type Barber = { id: string; display_name: string };
const demoNames = [
  "Acabamento (Pé)",
  "Barba Simples",
  "Barba Disf.",
  "Corte Simples",
  "Corte Disf. Máquina",
  "Corte Máquina e Tesoura",
  "Corte e Barba",
  "Sobrancelha",
  "Pigmentação",
];
export function Booking() {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [hours, setHours] = useState<Hours[]>([]);
  const [settings, setSettings] = useState<Settings>({
    id: 1,
    slot_step: 20,
    min_notice: 30,
    booking_window: 30,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [assignedBarber, setAssignedBarber] = useState("");
  const [date, setDate] = useState(localDate());
  const [start, setStart] = useState("");
  const [step, setStep] = useState(1);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const requestTracker = useRef({ id: 0 });
  const successDialog = useRef<HTMLDialogElement>(null);
  const selected = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds],
  );
  const total = useMemo(() => summarizeServices(selected), [selected]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!configured()) {
          setServices(
            demoNames.map((name, i) => ({
              id: String(i),
              name,
              price: 0,
              duration_minutes: 40,
              active: true,
            })),
          );
          return;
        }
        const db = browserDb();
        const [s, h, c, b] = await Promise.all([
          db.from("services").select("*").eq("active", true).order("name"),
          db.from("business_hours").select("*"),
          db.from("settings").select("*").eq("id", 1).single(),
          db.rpc("list_active_barbers"),
        ]);
        if (s.error || h.error || c.error || b.error)
          throw s.error ?? h.error ?? c.error ?? b.error;
        if (!active) return;
        const providers = (b.data ?? []) as Barber[];
        setServices(s.data ?? []);
        setHours(h.data ?? []);
        setSettings(c.data);
        setBarbers(providers);
        setBarberId(providers.length === 1 ? providers[0].id : null);
        const saved = sessionStorage.getItem("seven-booking");
        if (saved) {
          try {
            const value = JSON.parse(saved);
            const ids = Array.isArray(value.service_ids)
              ? value.service_ids
              : [value.service_id];
            const chosen = (s.data ?? []).filter((s) => ids.includes(s.id));
            if (
              chosen.length === ids.length &&
              chosen.length &&
              typeof value.start_at === "string" &&
              new Date(value.start_at) > new Date()
            ) {
              setSelectedIds(chosen.map((s) => s.id));
              setStart(value.start_at);
              setDate(localDate(new Date(value.start_at)));
              setBarberId(
                providers.length === 1
                  ? providers[0].id
                  : providers.some((b) => b.id === value.barber_id)
                    ? value.barber_id
                    : null,
              );
              setStep(4);
            }
          } catch {
            sessionStorage.removeItem("seven-booking");
          }
        }
      } catch (error) {
        if (active) setError(readableError(error));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!total.count || !configured()) return;
    const id = ++requestTracker.current.id;
    setSlotLoading(true);
    try {
      const providers = barberId
        ? barbers.filter((b) => b.id === barberId)
        : barbers;
      const ranges = await Promise.all(
        providers.map(async (b) => {
          const { data, error } = await browserDb().rpc("get_busy_ranges", {
            p_date: date,
            p_barber_id: b.id,
          });
          if (error) throw error;
          return (data ?? []) as Busy[];
        }),
      );
      if (id !== requestTracker.current.id) return;
      setSlots(
        availableSlotsForAnyBarber(
          date,
          total.duration_minutes,
          hours.find(
            (h) => h.weekday === new Date(`${date}T12:00:00-03:00`).getUTCDay(),
          ),
          settings,
          ranges,
        ),
      );
    } catch (error) {
      if (id === requestTracker.current.id) {
        setError(readableError(error));
        setSlots([]);
      }
    } finally {
      if (id === requestTracker.current.id) setSlotLoading(false);
    }
  }, [
    date,
    total.count,
    total.duration_minutes,
    hours,
    settings,
    barberId,
    barbers,
  ]);
  useEffect(() => {
    if (step !== 3) return;
    const tracker = requestTracker.current;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      clearInterval(timer);
      tracker.id++;
    };
  }, [step, refresh]);
  useEffect(() => {
    if (step === 5) successDialog.current?.showModal();
  }, [step]);
  const selection = {
    service_ids: selected.map((s) => s.id),
    start_at: start,
    barber_id: barberId,
  };
  function saveSelection() {
    sessionStorage.setItem("seven-booking", JSON.stringify(selection));
  }
  function finish(result: { barber_name?: string | null }) {
    sessionStorage.removeItem("seven-booking");
    setAssignedBarber(result.barber_name ?? "");
    setStep(5);
    setError("");
  }
  async function create() {
    const response = await fetch("/api/agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    finish(result);
  }
  async function confirm() {
    if (!total.count || !start) return;
    setBusy(true);
    setError("");
    try {
      saveSelection();
      if (!authenticated) {
        const db = browserDb();
        const {
          data: { user },
        } = await db.auth.getUser();
        if (!user) {
          setStep(6);
          return;
        }
        const { data: profile } = await db
          .from("profiles")
          .select("nome,telefone,privacy_accepted_at,must_change_password")
          .eq("id", user.id)
          .single();
        if (profile?.must_change_password) {
          location.assign("/trocar-senha?required=1&next=/");
          return;
        }
        if (
          !profile?.nome ||
          !profile.telefone ||
          !profile.privacy_accepted_at
        ) {
          location.assign("/completar-cadastro?next=/");
          return;
        }
      }
      await create();
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  const barberLabel =
    assignedBarber ||
    barbers.find((b) => b.id === barberId)?.display_name ||
    (barbers.length > 1 ? "Sem preferência" : "A definir");
  const labels =
    barbers.length > 1
      ? ["Serviços", "Barbeiro", "Data e horário", "Confirmação"]
      : ["Serviços", "Data e horário", "Confirmação"];
  const visibleStep =
    step >= 4
      ? labels.length
      : barbers.length > 1
        ? step
        : step === 1
          ? 1
          : step - 1;
  const max = new Date(`${localDate()}T12:00:00-03:00`);
  max.setUTCDate(max.getUTCDate() + settings.booking_window);
  return (
    <div className="booking-flow">
      <section className="booking-intro">
        <div>
          <p className="eyebrow">
            <span className="gold-stars">★ ★ ★ ★ ★ ★ ★</span> ESTILO EM CADA
            DETALHE
          </p>
          <h1>
            Seu estilo.
            <br />
            <span>Seu momento.</span>
          </h1>
          <p className="muted">
            Um corte bem feito muda o seu dia.
            <br />
            Escolha seus serviços e deixe o resto com a gente.
          </p>
        </div>
        <div className="intro-seal">
          <Scissors size={32} />
          <span>CUIDADO NO DETALHE</span>
          <small>Tradição, atitude e precisão.</small>
        </div>
      </section>
      <div className="booking-layout">
        <section>
          <ol className="steps" aria-label="Etapas do agendamento">
            {labels.map((label, i) => (
              <li className={visibleStep >= i + 1 ? "active" : ""} key={label}>
                <span>{visibleStep > i + 1 ? <Check size={15} /> : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!configured() && (
            <p className="setup-notice">
              Em breve, agendamentos por aqui. A agenda está sendo preparada
              pela barbearia.
            </p>
          )}
          {step === 1 && (
            <>
              <div className="section-head">
                <h2>O que vamos fazer hoje?</h2>
                <p className="muted">
                  Escolha um ou mais serviços para o seu atendimento.
                </p>
              </div>
              {loading ? (
                <div
                  className="service-grid"
                  role="status"
                  aria-label="Carregando serviços"
                >
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton" />
                  ))}
                </div>
              ) : services.length ? (
                <div className="service-grid">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      className={`service-card ${selectedIds.includes(s.id) ? "selected" : ""}`}
                      aria-pressed={selectedIds.includes(s.id)}
                      onClick={() => {
                        setSelectedIds((ids) =>
                          ids.includes(s.id)
                            ? ids.filter((id) => id !== s.id)
                            : [...ids, s.id],
                        );
                        setStart("");
                        setError("");
                      }}
                    >
                      <div className="row spaced">
                        <span className="service-icon">
                          <Scissors size={21} />
                        </span>
                        <span className="radio-mark">
                          {selectedIds.includes(s.id) && <Check size={13} />}
                        </span>
                      </div>
                      <h3>{s.name}</h3>
                      <div className="row spaced">
                        <span className="duration">
                          <Clock3 size={13} />
                          {s.duration_minutes} min
                        </span>
                        <strong>{money(s.price)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="card empty">
                  Nenhum serviço disponível no momento.
                </div>
              )}
              {configured() && !loading && !barbers.length && (
                <p className="error">Nenhum barbeiro disponível no momento.</p>
              )}
              <div className="booking-actions">
                <p className="muted">
                  <ShieldCheck size={15} /> Reserva rápida e segura
                </p>
                <button
                  className="button"
                  disabled={
                    !total.count ||
                    total.count > 20 ||
                    !configured() ||
                    !barbers.length
                  }
                  onClick={() => {
                    setStart("");
                    setError("");
                    if (barbers.length > 1) setStep(2);
                    else {
                      setBarberId(barbers[0].id);
                      setStep(3);
                    }
                  }}
                >
                  Continuar <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 2 && barbers.length > 1 && (
            <>
              <h2>Escolha o barbeiro</h2>
              <p className="muted">
                Selecione quem vai atender você ou deixe a equipe escolher.
              </p>
              <div className="service-grid barber-grid">
                {barbers.map((b) => (
                  <button
                    key={b.id}
                    className={`service-card ${barberId === b.id ? "selected" : ""}`}
                    aria-pressed={barberId === b.id}
                    onClick={() => {
                      setBarberId(b.id);
                      setStart("");
                    }}
                  >
                    <span className="service-icon">
                      <UserRound size={21} />
                    </span>
                    <h3>{b.display_name}</h3>
                    <span className="muted">Escolher este barbeiro</span>
                  </button>
                ))}
                <button
                  className={`service-card ${barberId === null ? "selected" : ""}`}
                  aria-pressed={barberId === null}
                  onClick={() => {
                    setBarberId(null);
                    setStart("");
                  }}
                >
                  <span className="service-icon">
                    <UserRound size={21} />
                  </span>
                  <h3>Sem preferência</h3>
                  <span className="muted">
                    A equipe encontra o melhor horário.
                  </span>
                </button>
              </div>
              <div className="booking-actions">
                <button className="quiet row" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Voltar
                </button>
                <button className="button" onClick={() => setStep(3)}>
                  Escolher horário <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>Reserve seu momento</h2>
              <p className="muted">
                {barberLabel} · horários no fuso de Brasília. Seus serviços
                ocupam {total.duration_minutes} minutos.
              </p>
              <label className="date-picker">
                Escolha o dia
                <input
                  type="date"
                  min={localDate()}
                  max={localDate(max)}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setStart("");
                    setError("");
                  }}
                />
              </label>
              <div className="day-strip">
                {Array.from(
                  { length: Math.min(settings.booking_window + 1, 31) },
                  (_, i) => {
                    const day = new Date(`${localDate()}T12:00:00-03:00`);
                    day.setUTCDate(day.getUTCDate() + i);
                    const value = localDate(day);
                    return (
                      <button
                        key={value}
                        className={date === value ? "chosen" : ""}
                        onClick={() => {
                          setDate(value);
                          setStart("");
                          setError("");
                        }}
                      >
                        <small>
                          {new Intl.DateTimeFormat("pt-BR", {
                            weekday: "short",
                            timeZone: "America/Sao_Paulo",
                          }).format(day)}
                        </small>
                        <strong>{day.getUTCDate()}</strong>
                      </button>
                    );
                  },
                )}
              </div>
              <h3>Horários disponíveis</h3>
              {slotLoading ? (
                <p role="status">Consultando a agenda…</p>
              ) : slots.length ? (
                <div className="time-grid">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      className={start === slot ? "chosen" : ""}
                      onClick={() => setStart(slot)}
                    >
                      {timeLabel(slot)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="card empty">
                  Sem horários disponíveis neste dia. Experimente outra data.
                </div>
              )}
              <div className="booking-actions">
                <button
                  className="quiet row"
                  onClick={() => setStep(barbers.length > 1 ? 2 : 1)}
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
                <button
                  className="button"
                  disabled={!start || !slots.includes(start) || slotLoading}
                  onClick={() => setStep(4)}
                >
                  Revisar reserva <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <h2>Tudo certo para o seu próximo corte?</h2>
              <p className="muted">
                Confira os detalhes no resumo. O agendamento fica pendente até a
                confirmação da barbearia.
              </p>
              <div className="booking-actions">
                <button
                  className="quiet row"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setStep(3);
                  }}
                >
                  <ArrowLeft size={16} /> Alterar horário
                </button>
                <button className="button" disabled={busy} onClick={confirm}>
                  {busy ? "Enviando…" : "Confirmar agendamento"}
                  <Check size={17} />
                </button>
              </div>
            </>
          )}
          {step === 6 && (
            <QuickSignup
              booking={selection}
              onBack={() => setStep(4)}
              onComplete={async (result) => {
                if (result.must_change_password) {
                  location.assign("/trocar-senha?required=1&next=/");
                  return;
                }
                setAuthenticated(true);
                window.dispatchEvent(new Event("seven-auth-changed"));
                if (result.appointment) {
                  finish(result.appointment);
                  return;
                }
                setStep(4);
                if (result.booking_error) {
                  setError(result.booking_error);
                  return;
                }
                try {
                  setBusy(true);
                  await create();
                } catch (error) {
                  setError(readableError(error));
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {step === 5 && (
            <>
              <h2>Agendamento enviado</h2>
              <Link className="button" href="/meus-agendamentos">
                Ver meus agendamentos
              </Link>
            </>
          )}
        </section>
        <BookingSummary
          services={selected}
          barber={barberLabel}
          start={start}
        />
      </div>
      <dialog
        ref={successDialog}
        className="card booking-success"
        aria-label="Agendamento enviado"
      >
        <Check size={40} color="#22c55e" />
        <p>{BOOKING_SUCCESS_MESSAGE}</p>
        <Link className="button full" href="/meus-agendamentos">
          Ver meus agendamentos
        </Link>
      </dialog>
    </div>
  );
}
