"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
import { PENDING_REMINDER_MS, POLLING_MS } from "@/lib/notification-config";
import type { Appointment } from "@/lib/types";
import { readableError } from "@/lib/validation";
import { AppointmentCard } from "./appointment-card";
export function AdminAlerts({
  role,
}: {
  role: "barber" | "admin" | "master";
}) {
  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState(true);
  const [pending, setPending] = useState<Appointment[]>([]);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [wakeWarning, setWakeWarning] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef(new Set<string>());
  const reminders = useRef<Record<string, number>>({});
  const active = useRef(false);
  const loading = useRef(false);
  const latest = useRef<Appointment[]>([]);
  const announce = useCallback((text: string, beep = false) => {
    if (!active.current) return;
    if (beep && audio.current) {
      const context = audio.current;
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.setValueAtTime(740, context.currentTime);
      gain.gain.setValueAtTime(0.09, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
    }
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      const voice = speechSynthesis.getVoices().find((v) => v.lang === "pt-BR");
      if (voice) utterance.voice = voice;
      speechSynthesis.speak(utterance);
    }
  }, []);
  const check = useCallback(
    (items: Appointment[]) => {
      if (!active.current) return;
      let reminder = false;
      for (const item of items) {
        if (!seen.current.has(item.id)) {
          announce(
            role === "barber"
              ? `Cliente ${item.profiles?.nome ?? "da barbearia"}, realizou um novo agendamento.`
              : `Cliente ${item.profiles?.nome ?? "da barbearia"}, novo agendamento com ${item.barber_name ?? "a equipe"}.`,
            true,
          );
          seen.current.add(item.id);
        }
        const bucket = Math.floor(
          (Date.now() - new Date(item.created_at).getTime()) /
            PENDING_REMINDER_MS,
        );
        if (bucket >= 1 && bucket > (reminders.current[item.id] ?? 0)) {
          reminder = true;
          reminders.current[item.id] = bucket;
        }
      }
      if (reminder)
        announce("Atenção, novo agendamento precisando de confirmação.");
      try {
        sessionStorage.setItem(
          "seven-announced",
          JSON.stringify([...seen.current].slice(-2000)),
        );
        sessionStorage.setItem(
          "seven-reminders",
          JSON.stringify(reminders.current),
        );
      } catch {
        /* O alerta funciona mesmo sem armazenamento. */
      }
    },
    [announce, role],
  );
  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const { data, error } = await browserDb()
        .from("appointments")
        .select("*,profiles(*)")
        .eq("status", "pendente")
        .order("created_at");
      if (error) throw error;
      latest.current = (data ?? []) as Appointment[];
      setPending(latest.current);
      check(latest.current);
      setError("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      loading.current = false;
    }
  }, [check]);
  useEffect(() => {
    try {
      seen.current = new Set(
        JSON.parse(sessionStorage.getItem("seven-announced") ?? "[]"),
      );
      reminders.current = JSON.parse(
        sessionStorage.getItem("seven-reminders") ?? "{}",
      );
    } catch {
      seen.current = new Set();
      reminders.current = {};
    }
    void refresh();
    const db = browserDb();
    const channel = db
      .channel("admin-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => void refresh(),
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void refresh();
      });
    const timer = setInterval(() => void refresh(), POLLING_MS);
    return () => {
      clearInterval(timer);
      void db.removeChannel(channel);
      active.current = false;
      void audio.current?.close();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
  }, [refresh]);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    async function acquire() {
      if (document.visibilityState !== "visible") return;
      if (!("wakeLock" in navigator)) {
        setWakeWarning(
          "Este navegador não mantém a tela acesa automaticamente. Ajuste o bloqueio de tela do dispositivo.",
        );
        return;
      }
      try {
        const obtained = await navigator.wakeLock.request("screen");
        if (disposed) {
          await obtained.release();
          return;
        }
        lock = obtained;
        setWakeWarning("");
      } catch {
        setWakeWarning(
          "Não foi possível manter a tela acesa. Verifique as configurações de energia.",
        );
      }
    }
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, []);
  async function enable() {
    try {
      if (!audio.current || audio.current.state === "closed")
        audio.current = new AudioContext();
      await audio.current.resume();
      active.current = true;
      setEnabled(true);
      setPrompt(false);
      announce("Alertas sonoros ativados.", true);
      check(latest.current);
    } catch {
      setError(
        "Não foi possível ativar o áudio. Tente novamente neste navegador.",
      );
    }
  }
  return (
    <section className="alerts">
      <div className="row spaced">
        <button
          className={`alert-indicator ${enabled ? "on" : "off"}`}
          onClick={() => {
            if (enabled) {
              active.current = false;
              setEnabled(false);
              if ("speechSynthesis" in window) speechSynthesis.cancel();
            } else void enable();
          }}
        >
          {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}Alertas{" "}
          {enabled ? "ativos" : "desativados"}
        </button>
        <small className="muted">
          {connected
            ? "Agenda conectada em tempo real"
            : "Consultando a agenda a cada 30 segundos"}
        </small>
      </div>
      {prompt && (
        <div className="sound-prompt">
          <Volume2 size={30} />
          <div>
            <h3>Não perca um novo agendamento</h3>
            <p>Ative o som e a voz para receber os avisos da agenda.</p>
          </div>
          <button className="button" onClick={enable}>
            Ativar alertas sonoros
          </button>
        </div>
      )}
      {wakeWarning && <p className="muted">{wakeWarning}</p>}
      {error && (
        <p className="error" role="alert">
          Falha ao consultar pendências: {error}
        </p>
      )}
      {pending.length > 0 && (
        <details open>
          <summary>
            {pending.length} agendamento(s) aguardando confirmação
          </summary>
          <div className="grid" style={{ marginTop: 16 }}>
            {pending.map((a) => (
              <AppointmentCard key={a.id} item={a} onChange={refresh} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
