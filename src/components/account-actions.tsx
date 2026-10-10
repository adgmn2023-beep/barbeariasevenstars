"use client";
import { useEffect, useRef, useState } from "react";
import { readableError } from "@/lib/validation";
export function AccountActions() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistration()
        .then(async (registration) =>
          setActive(!!(await registration?.pushManager.getSubscription())),
        );
  }, []);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error(
          "Este navegador não oferece notificações. No iPhone, instale o app na tela inicial e abra por ele.",
        );
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const response = await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        await existing.unsubscribe();
        setActive(false);
      } else {
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!key)
          throw new Error(
            "As notificações ainda não foram configuradas pela barbearia.",
          );
        if ((await Notification.requestPermission()) !== "granted")
          throw new Error(
            "Permita notificações nas configurações do navegador para continuar.",
          );
        const bytes = Uint8Array.from(
          atob(key.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        );
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
        const response = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!response.ok) {
          await subscription.unsubscribe();
          throw new Error((await response.json()).error);
        }
        setActive(true);
      }
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const confirmation = String(
        new FormData(e.currentTarget).get("confirmation"),
      );
      const response = await fetch("/api/conta", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      sessionStorage.clear();
      location.assign("/");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card narrow" style={{ marginTop: 24 }}>
      <h2>Notificações</h2>
      <p className="muted">
        Receba atualizações dos seus agendamentos. No iPhone, o push requer iOS
        16.4 ou superior e o app instalado na tela inicial.
      </p>
      <button className="button outline" disabled={busy} onClick={toggle}>
        {busy
          ? "Aguarde…"
          : active
            ? "Desativar notificações neste dispositivo"
            : "Ativar notificações"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <hr style={{ borderColor: "#3A322E", margin: "30px 0" }} />
      <h3>Excluir minha conta</h3>
      <p className="muted">
        Seus dados pessoais e reservas não concluídas serão apagados.
        Atendimentos concluídos permanecem anonimizados.
      </p>
      <button
        className="button outline danger"
        disabled={busy}
        onClick={() => dialog.current?.showModal()}
      >
        Excluir minha conta
      </button>
      <dialog ref={dialog} className="card cancel-dialog">
        <h2>Excluir conta permanentemente?</h2>
        <p>Esta ação não pode ser desfeita. Digite EXCLUIR para confirmar.</p>
        <form onSubmit={remove}>
          <label>
            Confirmação
            <input
              name="confirmation"
              pattern="EXCLUIR"
              required
              autoComplete="off"
            />
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
              Excluir definitivamente
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
