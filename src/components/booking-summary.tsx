"use client";
import { useRef, useState } from "react";
import { ChevronUp, Scissors, X } from "lucide-react";
import type { Service } from "@/lib/types";
import { dateLabel, money, timeLabel } from "@/lib/schedule";
import { summarizeServices } from "@/lib/booking-summary";
export function BookingSummary({
  services,
  barber,
  start,
}: {
  services: Service[];
  barber: string;
  start: string;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const total = summarizeServices(services);
  const content = (
    <>
      <p className="eyebrow">SEU AGENDAMENTO</p>
      <div className="summary-icon">
        <Scissors size={26} />
      </div>
      {services.length ? (
        <ul className="summary-services">
          {services.map((s) => (
            <li key={s.id}>
              <span>
                {s.name}
                <small>{s.duration_minutes} min</small>
              </span>
              <strong>{money(s.price)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Selecione seus serviços para começar.</p>
      )}
      <div className="summary-line">
        <span>Barbeiro</span>
        <strong>{barber}</strong>
      </div>
      <div className="summary-line">
        <span>Data e horário</span>
        <strong>
          {start ? `${dateLabel(start)} · ${timeLabel(start)}` : "A escolher"}
        </strong>
      </div>
      <div className="summary-line">
        <span>Duração total</span>
        <strong>{total.duration_minutes} minutos</strong>
      </div>
      <div className="summary-line total">
        <span>Total</span>
        <strong>{money(total.price)}</strong>
      </div>
      <p className="summary-note">Pagamento presencial na barbearia.</p>
    </>
  );
  return (
    <>
      <aside className="booking-sidebar">
        <div className="card summary">{content}</div>
      </aside>
      <div className="mobile-booking-bar">
        <button
          className="summary-toggle"
          aria-label="Ver resumo do agendamento"
          aria-controls="mobile-booking-summary"
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
            dialog.current?.showModal();
          }}
        >
          <span>
            {total.count} {total.count === 1 ? "serviço" : "serviços"}
            <small>{total.duration_minutes} minutos</small>
          </span>
          <strong>{money(total.price)}</strong>
          <ChevronUp size={20} />
        </button>
      </div>
      <dialog
        id="mobile-booking-summary"
        ref={dialog}
        className="booking-sheet"
        aria-label="Resumo do agendamento"
        onClose={() => setOpen(false)}
      >
        <button
          className="quiet sheet-close"
          aria-label="Fechar resumo"
          onClick={() => dialog.current?.close()}
        >
          <X size={24} />
        </button>
        {content}
      </dialog>
    </>
  );
}
