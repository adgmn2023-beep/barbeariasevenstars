"use client";
import { useState } from "react";
import { safeNext } from "@/lib/validation";

export function ForcePasswordChange() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const password = String(values.password);
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError("Use pelo menos 12 caracteres, incluindo maiúscula, minúscula, número e símbolo.");
      return;
    }
    if (password !== values.confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/conta/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const next = safeNext(new URLSearchParams(location.search).get("next"));
      location.assign(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a senha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth card">
      <p className="eyebrow">SEGURANÇA DA CONTA</p>
      <h1>Crie sua senha pessoal</h1>
      <p className="muted">Para continuar, substitua a senha provisória por uma senha que só você conheça.</p>
      <form onSubmit={submit}>
        <label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
        <label>Confirme a nova senha<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button full" disabled={busy}>{busy ? "Atualizando…" : "Salvar senha e continuar"}</button>
      </form>
    </section>
  );
}