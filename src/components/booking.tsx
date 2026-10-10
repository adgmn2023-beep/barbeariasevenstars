"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Scissors,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import { browserDb, configured } from "@/lib/supabase/client";
import {
  availableSlotsForAnyBarber,
  dateLabel,
  localDate,
  money,
  timeLabel,
} from "@/lib/schedule";
import type { Service, Hours, Settings, Busy } from "@/lib/types";
import { readableError } from "@/lib/validation";
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
  const [barbers, setBarbers] = useState<{ id: string; display_name: string }[]>([]);
  const [hours, setHours] = useState<Hours[]>([]);
  const [settings, setSettings] = useState<Settings>({
    id: 1,
    slot_step: 20,
    min_notice: 30,
    booking_window: 30,
  });
  const [service, setService] = useState<Service | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [assignedBarberName, setAssignedBarberName] = useState("");
  const [date, setDate] = useState(localDate());
  const [start, setStart] = useState("");
  const [step, setStep] = useState(1);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availabilityRequest = useRef({ id: 0 });
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
        setServices(s.data ?? []);
        setBarbers(b.data ?? []);
        setHours(h.data ?? []);
        setSettings(c.data);
        const saved = sessionStorage.getItem("seven-booking");
        if (saved) {
          try {
            const v = JSON.parse(saved);
            const found = s.data?.find((s) => s.id === v.service_id);
            if (
              found &&
              typeof v.start_at === "string" &&
              new Date(v.start_at) > new Date()
            ) {
              setService(found);
              setStart(v.start_at);
              setDate(localDate(new Date(v.start_at)));
              setSelectedBarberId(
                typeof v.barber_id === "string" &&
                  b.data?.some(
                    (barber: { id: string; display_name: string }) =>
                      barber.id === v.barber_id,
                  )
                  ? v.barber_id
                  : null,
              );
              setAssignedBarberName(
                typeof v.barber_name === "string" ? v.barber_name : "",
              );
              setStep(4);
            }
          } catch {
            sessionStorage.removeItem("seven-booking");
          }
        }
      } catch (e) {
        if (active) setError(readableError(e));
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
    if (!service || !configured()) return;
    const requestId = ++availabilityRequest.current.id;
    setSlotLoading(true);
    try {
      const providers = selectedBarberId
        ? barbers.filter((barber) => barber.id === selectedBarberId)
        : barbers;
      const busyByBarber = await Promise.all(
        providers.map(async (barber) => {
          const { data, error } = await browserDb().rpc("get_busy_ranges", {
            p_date: date,
            p_barber_id: barber.id,
          });
          if (error) throw error;
          return (data ?? []) as Busy[];
        }),
      );
      if (requestId !== availabilityRequest.current.id) return;
      setSlots(
        availableSlotsForAnyBarber(
          date,
          service.duration_minutes,
          hours.find(
            (h) => h.weekday === new Date(`${date}T12:00:00-03:00`).getUTCDay(),
          ),
          settings,
          busyByBarber,
        ),
      );
    } catch (e) {
      if (requestId !== availabilityRequest.current.id) return;
      setError(readableError(e));
      setSlots([]);
    } finally {
      if (requestId === availabilityRequest.current.id) setSlotLoading(false);
    }
  }, [date, service, hours, settings, barbers, selectedBarberId]);
  useEffect(() => {
    if (step !== 3) return;
    const tracker = availabilityRequest.current;
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    return () => {
      clearInterval(interval);
      tracker.id++;
    };
  }, [refresh, step]);
  async function confirm() {
    if (!service || !start) return;
    setBusy(true);
    setError("");
    try {
      const db = browserDb();
      sessionStorage.setItem(
        "seven-booking",
        JSON.stringify({
          service_id: service.id,
          start_at: start,
          barber_id: selectedBarberId,
        }),
      );
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) {
        location.assign("/login?next=/");
        return;
      }
      const { data: p } = await db
        .from("profiles")
        .select("telefone,data_nascimento,privacy_accepted_at")
        .eq("id", user.id)
        .single();
      if (!p?.telefone || !p.data_nascimento || !p.privacy_accepted_at) {
        location.assign("/completar-cadastro?next=/");
        return;
      }
      const response = await fetch("/api/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: service.id,
          start_at: start,
          barber_id: selectedBarberId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      sessionStorage.removeItem("seven-booking");
      setAssignedBarberName(result.barber_name ?? "");
      setStep(5);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  const max = new Date(`${localDate()}T12:00:00-03:00`);
  max.setUTCDate(max.getUTCDate() + settings.booking_window);
  const selectedBarber = barbers.find(
    (barber) => barber.id === selectedBarberId,
  );
  const barberLabel =
    assignedBarberName ||
    selectedBarber?.display_name ||
    (barbers.length > 1 ? "Sem preferência" : "A definir");
  const visibleStep = barbers.length > 1 ? step : step === 1 ? 1 : step - 1;
  const stepLabels =
    barbers.length > 1
      ? ["Serviço", "Barbeiro", "Data e horário", "Confirmação"]
      : ["Serviço", "Data e horário", "Confirmação"];
  return (
    <>
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
            Escolha seu serviço e deixe o resto com a gente.
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
            {stepLabels.map((label, i) => (
              <li key={label} className={visibleStep >= i + 1 ? "active" : ""}>
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
              <div className="row spaced section-head">
                <div>
                  <h2>O que vamos fazer hoje?</h2>
                  <p className="muted">
                    Escolha o serviço que combina com você.
                  </p>
                </div>
                <span className="badge">01 / {stepLabels.length.toString().padStart(2, "0")}</span>
              </div>
              {loading ? (
                <div
                  className="service-grid"
                  role="status"
                  aria-label="Carregando serviços"
                >
                  {[1, 2, 3, 4].map((i) => (
                    <div className="skeleton" key={i} />
                  ))}
                </div>
              ) : !services.length ? (
                <div className="card empty">
                  Nenhum serviço disponível no momento.
                </div>
              ) : (
                <div className="service-grid">
                  {services.map((s, i) => (
                    <button
                      key={s.id}
                      className={`service-card ${service?.id === s.id ? "selected" : ""}`}
                      onClick={() => {
                        setService(s);
                        setStart("");
                        setSelectedBarberId(null);
                        setAssignedBarberName("");
                      }}
                      aria-pressed={service?.id === s.id}
                    >
                      <div className="row spaced">
                        <span className="service-icon">
                          <Scissors size={21} />
                        </span>
                        <span className="radio-mark">
                          {service?.id === s.id && <Check size={13} />}
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
                      {i === 6 && (
                        <span className="popular">O combo completo</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="booking-actions">
                <p className="muted">
                  <ShieldCheck size={15} /> Reserva rápida e segura
                </p>
                <button
                  className="button"
                  disabled={!service || !configured() || !barbers.length}
                  onClick={() => {
                    setError("");
                    setStart("");
                    if (barbers.length > 1) setStep(2);
                    else {
                      setSelectedBarberId(barbers[0]?.id ?? null);
                      setStep(3);
                    }
                  }}
                >
                  Continuar <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>Escolha o barbeiro</h2>
              <p className="muted">
                Selecione quem vai atender você ou deixe a equipe escolher.
              </p>
              <div className="service-grid barber-grid">
                {barbers.map((barber) => (
                  <button
                    className={`service-card ${selectedBarberId === barber.id ? "selected" : ""}`}
                    key={barber.id}
                    onClick={() => {
                      setSelectedBarberId(barber.id);
                      setStart("");
                    }}
                    aria-pressed={selectedBarberId === barber.id}
                  >
                    <span className="service-icon"><UserRound size={21} /></span>
                    <h3>{barber.display_name}</h3>
                    <span className="muted">Escolher este barbeiro</span>
                  </button>
                ))}
                <button
                  className={`service-card ${selectedBarberId === null ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedBarberId(null);
                    setStart("");
                  }}
                  aria-pressed={selectedBarberId === null}
                >
                  <span className="service-icon"><UserRound size={21} /></span>
                  <h3>Sem preferência</h3>
                  <span className="muted">A equipe encontra o melhor horário.</span>
                </button>
              </div>
              <div className="booking-actions">
                <button className="quiet row" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Voltar
                </button>
                <button className="button" disabled={selectedBarberId === null && !barbers.length} onClick={() => setStep(3)}>
                  Escolher horário <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>Reserve seu momento</h2>
              <p className="muted">
                {barberLabel} · horários no fuso de Brasília. O serviço ocupa {service?.duration_minutes} minutos.
              </p>
              <label className="date-picker">
                Escolha o dia
                <input
                  type="date"
                  min={localDate()}
                  max={localDate(max)}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setStart("");
                    setError("");
                  }}
                />
              </label>
              <div className="day-strip">
                {Array.from(
                  { length: Math.min(settings.booking_window + 1, 31) },
                  (_, i) => {
                    const d = new Date(`${localDate()}T12:00:00-03:00`);
                    d.setUTCDate(d.getUTCDate() + i);
                    const value = localDate(d);
                    return (
                      <button
                        className={date === value ? "chosen" : ""}
                        key={value}
                        onClick={() => {
                          setDate(value);
                          setStart("");
                        }}
                      >
                        <small>
                          {new Intl.DateTimeFormat("pt-BR", {
                            weekday: "short",
                            timeZone: "America/Sao_Paulo",
                          }).format(d)}
                        </small>
                        <strong>{d.getUTCDate()}</strong>
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
                  {slots.map((s) => (
                    <button
                      key={s}
                      className={start === s ? "chosen" : ""}
                      onClick={() => setStart(s)}
                    >
                      {timeLabel(s)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="card empty">
                  Sem horários disponíveis neste dia. Experimente outra data.
                </div>
              )}
              <div className="booking-actions">
                <button className="quiet row" onClick={() => setStep(barbers.length > 1 ? 2 : 1)}>
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
                Revise os detalhes antes de enviar sua reserva.
              </p>
              <div className="card confirmation">
                <span className="service-icon">
                  <Scissors />
                </span>
                <h2>{service?.name}</h2>
                <p>
                  {dateLabel(start)} · {timeLabel(start)}
                </p>
                <p className="muted">
                  Duração de {service?.duration_minutes} minutos
                </p>
                <p>Barbeiro: {barberLabel}</p>
                <strong>{money(service?.price ?? 0)}</strong>
                <p className="muted">
                  O agendamento fica pendente até a confirmação da barbearia.
                </p>
              </div>
              <div className="booking-actions">
                <button className="quiet row" onClick={() => setStep(3)}>
                  <ArrowLeft size={16} /> Alterar horário
                </button>
                <button disabled={busy} className="button" onClick={confirm}>
                  {busy ? "Enviando…" : "Confirmar agendamento"}
                  <Check size={17} />
                </button>
              </div>
            </>
          )}
          {step === 5 && (
            <div className="card confirmation">
              <Check size={42} color="#22c55e" />
              <h2>Seu horário foi reservado!</h2>
              <p>Barbeiro: {assignedBarberName || barberLabel}</p>
              <p>
                A barbearia recebeu o pedido. Acompanhe a confirmação em seus
                agendamentos.
              </p>
              <a className="button" href="/meus-agendamentos">
                Ver meus agendamentos
              </a>
            </div>
          )}
        </section>
        <aside className="booking-sidebar">
          <div className="card summary">
            <p className="eyebrow">SEU AGENDAMENTO</p>
            <div className="summary-icon">
              <Scissors size={26} />
            </div>
            <h3>{service?.name ?? "Um tempo para você"}</h3>
            <p className="muted">
              {service
                ? `${service.duration_minutes} minutos de cuidado.`
                : "Selecione um serviço para começar sua reserva."}
            </p>
            <div className="summary-line">
              <span>Serviço</span>
              <strong>{service ? money(service.price) : "—"}</strong>
            </div>
            <div className="summary-line">
              <span>Barbeiro</span>
              <strong>{barberLabel}</strong>
            </div>
            <div className="summary-line">
              <span>Data e horário</span>
              <strong>
                {start
                  ? `${new Date(start).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${timeLabel(start)}`
                  : "A escolher"}
              </strong>
            </div>
            <div className="summary-line total">
              <span>Total</span>
              <strong>{service ? money(service.price) : "—"}</strong>
            </div>
            <p className="summary-note">Pagamento presencial na barbearia.</p>
          </div>
          <div className="care-note">
            <Star size={20} />
            <h3>
              Mais que um corte.
              <br />
              Uma experiência.
            </h3>
            <p>Atendimento com hora marcada e atenção exclusiva para você.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
