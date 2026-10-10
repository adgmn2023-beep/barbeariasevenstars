"use client";
import { useRef, useState } from "react";
import type { Appointment, Status } from "@/lib/types";
import {
  canTransition,
  dateLabel,
  money,
  statusLabels,
  timeLabel,
} from "@/lib/schedule";
import { readableError, statusSchema } from "@/lib/validation";
export function AppointmentCard({
  item,
  onChange,
}: {
  item: Appointment;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  async function update(status: Status, reason?: string) {
    setBusy(true);
    setError("");
    try {
      const data = statusSchema.parse({ status, cancel_reason: reason });
      const response = await fetch(`/api/admin/agendamentos/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      dialog.current?.close();
      if (body.warning) window.alert(body.warning);
      onChange();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`card appointment-card ${item.status === "pendente" ? "pending" : ""}`}
    >
      <div className="row spaced">
        <span className="badge">{statusLabels[item.status]}</span>
        <strong>
          {timeLabel(item.start_at)} – {timeLabel(item.end_at)}
        </strong>
      </div>
      <h3>{item.profiles?.nome ?? "Cliente excluído"}</h3>
      <p className="muted">
        {item.profiles?.telefone ?? "Sem telefone"} · {item.service_name}
      </p>
      <p>
        {dateLabel(item.start_at)} · {money(item.price)}
      </p>
      {item.cancel_reason && <p className="error">{item.cancel_reason}</p>}
      <div className="row">
        {item.status === "pendente" && (
          <>
            <button
              className="button"
              disabled={busy}
              onClick={() => update("confirmado")}
            >
              Confirmar
            </button>
            <button
              className="button outline danger"
              disabled={busy}
              onClick={() => dialog.current?.showModal()}
            >
              Cancelar
            </button>
          </>
        )}
        {canTransition(item.status, "concluido", item.end_at) && (
          <>
            <button
              className="button"
              disabled={busy}
              onClick={() => update("concluido")}
            >
              Marcar como Concluído
            </button>
            <button
              className="button outline"
              disabled={busy}
              onClick={() => update("faltou")}
            >
              Marcar como Faltou
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <dialog ref={dialog} className="card cancel-dialog">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void update(
              "cancelado",
              String(new FormData(e.currentTarget).get("reason")),
            );
          }}
        >
          <h2>Cancelar agendamento</h2>
          <p>O cliente receberá o motivo informado abaixo.</p>
          <label>
            Motivo do cancelamento
            <textarea name="reason" minLength={3} maxLength={500} required />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button
              type="button"
              className="button outline"
              onClick={() => dialog.current?.close()}
            >
              Voltar
            </button>
            <button className="button danger" disabled={busy}>
              {busy ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
          </div>
        </form>
      </dialog>
    </article>
  );
}
