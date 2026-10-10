"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { browserDb } from "@/lib/supabase/client";
import {
  loginSchema,
  profileSchema,
  readableError,
  safeNext,
} from "@/lib/validation";
export function phoneMask(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d.length > 6
    ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`
    : d.length > 2
      ? `(${d.slice(0, 2)}) ${d.slice(2)}`
      : d;
}
export function AuthForm({
  mode,
}: {
  mode: "login" | "cadastro" | "recuperar" | "redefinir";
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [nextPath, setNextPath] = useState('/');
  useEffect(()=>{const query=new URLSearchParams(location.search);setNextPath(safeNext(query.get('next')));if(query.get('erro')==='link')setError('Este link é inválido ou expirou. Solicite um novo e-mail e abra no mesmo navegador.');},[]);
  const register = mode === "cadastro";
  const title = {
    login: "Bem-vindo de volta",
    cadastro: "Seu próximo estilo começa aqui",
    recuperar: "Esqueci minha senha",
    redefinir: "Crie uma nova senha",
  }[mode];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const form = Object.fromEntries(new FormData(e.currentTarget));
      const db = browserDb();
      const next = safeNext(new URLSearchParams(location.search).get("next"));
      if (mode === "recuperar") {
        const email = loginSchema.shape.email.parse(form.email);
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/redefinir-senha`,
        });
        if (error) throw error;
        setMessage(
          "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.",
        );
      } else if (mode === "redefinir") {
        const password = loginSchema.shape.password.parse(form.password);
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Senha atualizada. Você já pode continuar.");
      } else {
        const credentials = loginSchema.parse(form);
        if (register) {
          const p = profileSchema.parse({
            ...form,
            privacy_accepted: form.privacy_accepted === "on",
          });
          const { data, error } = await db.auth.signUp({
            ...credentials,
            options: {
              data: p,
              emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            },
          });
          if (error) throw error;
          if (data.session) location.assign(next);
          else
            setMessage(
              "Confira seu e-mail para confirmar o cadastro. Depois, entre para continuar seu agendamento.",
            );
        } else {
          const { data, error } = await db.auth.signInWithPassword(credentials);
          if (error) throw error;
          const { data: p } = await db
            .from("profiles")
            .select("*")
            .eq("id", data.user.id)
            .single();
          location.assign(
            !p?.telefone || !p?.data_nascimento || !p?.privacy_accepted_at
              ? `/completar-cadastro?next=${encodeURIComponent(next)}`
              : next,
          );
        }
      }
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const next = safeNext(new URLSearchParams(location.search).get("next"));
      const { error } = await browserDb().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
    } catch (e) {
      setError(readableError(e));
      setBusy(false);
    }
  }
  return (
    <section className="auth card">
      <Image
        src="/logo.png"
        alt="Seven Stars"
        width={120}
        height={120}
        className="auth-logo"
      />
      <p className="eyebrow">SEVEN STARS BARBERSHOP</p>
      <h1>{title}</h1>
      <p className="muted">
        {register
          ? "Crie sua conta e reserve um tempo para você."
          : "O cuidado de sempre, no horário que combina com você."}
      </p>
      <form onSubmit={submit}>
        {register && (
          <>
            <label>
              Nome completo
              <input name="nome" autoComplete="name" required />
            </label>
            <label>
              Telefone com DDD
              <input
                name="telefone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(phoneMask(e.target.value))}
                required
              />
            </label>
            <label>
              Data de nascimento
              <input name="data_nascimento" type="date" required />
            </label>
          </>
        )}
        {mode !== "redefinir" && (
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" required />
          </label>
        )}
        {mode !== "recuperar" && (
          <label>
            Senha
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
            <small className="muted">Pelo menos 8 caracteres.</small>
          </label>
        )}
        {register && (
          <label className="check">
            <input name="privacy_accepted" type="checkbox" required />
            Li e aceito a{" "}
            <Link href="/privacidade">política de privacidade</Link>.
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        <button className="button full" disabled={busy}>
          {busy
            ? "Aguarde…"
            : {
                login: "Entrar",
                cadastro: "Criar minha conta",
                recuperar: "Enviar link de recuperação",
                redefinir: "Salvar nova senha",
              }[mode]}
        </button>
      </form>
      {(register || mode === "login") && (
        <>
          <div className="divider">ou</div>
          <button
            disabled={busy}
            className="button outline full"
            onClick={google}
          >
            Continuar com Google
          </button>
        </>
      )}
      <div className="auth-links">
        <Link href={`${register ? '/login' : '/cadastro'}?next=${encodeURIComponent(nextPath)}`}>
          {register ? "Já tenho uma conta" : "Criar uma conta"}
        </Link>
        <Link href="/esqueci-senha">Esqueci minha senha</Link>
      </div>
      {mode === "redefinir" && message && (
        <Link className="button" href="/">
          Continuar para agendar
        </Link>
      )}
    </section>
  );
}
