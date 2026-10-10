"use client";
import { useState } from "react";
import Link from "next/link";
import { PasswordInput } from "./password-input";
import {
  phoneMask,
  phoneLoginSchema,
  quickSignupSchema,
  PHONE_EXISTS_MESSAGE,
} from "@/lib/phone-auth";
import { readableError } from "@/lib/validation";
import type { BookingInput } from "@/lib/booking-server";
type SignupResult = {
  account_created?: boolean;
  appointment?: { id: string; barber_name: string | null } | null;
  booking_error?: string;
  must_change_password?: boolean;
};
export function QuickSignup({
  booking,
  onComplete,
  onBack,
  initialMode = "signup",
}: {
  booking?: BookingInput;
  onComplete: (result: SignupResult) => void | Promise<void>;
  onBack?: () => void;
  initialMode?: "signup" | "login";
}) {
  const [mode, setMode] = useState(initialMode);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    try {
      const fields = Object.fromEntries(new FormData(form));
      const input =
        mode === "signup"
          ? quickSignupSchema.parse({
              ...fields,
              telefone: phone,
              privacy_accepted: fields.privacy_accepted === "on",
            })
          : phoneLoginSchema.parse({ ...fields, telefone: phone });
      const response = await fetch(
        mode === "signup" ? "/api/auth/cadastro-rapido" : "/api/auth/telefone",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            ...(mode === "signup" && booking ? { booking } : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (
          result.code === "PHONE_EXISTS" ||
          result.code === "LOGIN_REQUIRED"
        ) {
          setMode("login");
          form.reset();
          setError(
            result.code === "PHONE_EXISTS"
              ? PHONE_EXISTS_MESSAGE
              : result.error,
          );
          return;
        }
        throw new Error(result.error);
      }
      form.reset();
      await onComplete(result);
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card quick-signup">
      <p className="eyebrow">FALTA SÓ UM PASSO</p>
      <h2>{mode === "signup" ? "Seus dados" : "Entre com seu telefone"}</h2>
      <p className="muted">
        {mode === "signup"
          ? "Informe seus dados para concluir. Sua seleção continua salva nesta tela."
          : "Use a senha da sua conta para concluir o agendamento."}
      </p>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Nome completo
            <input
              name="nome"
              autoComplete="name"
              maxLength={120}
              minLength={2}
              required
            />
          </label>
        )}
        <label>
          Telefone com DDD
          <input
            name="telefone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(phoneMask(event.target.value))}
            required
          />
        </label>
        <PasswordInput
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        <small className="muted">Pelo menos 8 caracteres.</small>
        {mode === "signup" && (
          <label className="check">
            <input name="privacy_accepted" type="checkbox" required />
            Li e aceito a{" "}
            <Link href="/privacidade" target="_blank" rel="noreferrer">
              política de privacidade
            </Link>
            .
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button full" disabled={busy}>
          {busy
            ? "Concluindo…"
            : mode === "signup"
              ? booking
                ? "Criar conta e agendar"
                : "Criar minha conta"
              : "Entrar e continuar"}
        </button>
      </form>
      <div className="auth-links">
        <button
          className="quiet"
          disabled={busy}
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
          }}
        >
          {mode === "signup" ? "Já tenho conta" : "Criar minha conta"}
        </button>
        {onBack && (
          <button className="quiet" disabled={busy} onClick={onBack}>
            Voltar à confirmação
          </button>
        )}
      </div>
      {mode === "login" && (
        <p className="muted">
          Esqueceu sua senha? Fale com a barbearia para receber uma senha
          provisória.
        </p>
      )}
    </section>
  );
}
