"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { browserDb } from "@/lib/supabase/client";
import { loginSchema, readableError, safeNext } from "@/lib/validation";
import { phoneLoginSchema, phoneMask } from "@/lib/phone-auth";
import { PasswordInput } from "./password-input";
import { QuickSignup } from "./quick-signup";
export { phoneMask } from "@/lib/phone-auth";
export function AuthForm({
  mode,
}: {
  mode: "login" | "cadastro" | "recuperar" | "redefinir";
}) {
  const [staff, setStaff] = useState(false);
  const [phone, setPhone] = useState("");
  const [next, setNext] = useState("/");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    setNext(safeNext(query.get("next")));
    setStaff(
      query.get("equipe") === "1" ||
        query.get("next")?.startsWith("/painelinterno") === true,
    );
    if (query.get("erro") === "link")
      setError("Este link é inválido ou expirou. Solicite um novo e-mail.");
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      if (mode === "recuperar") {
        const email = loginSchema.shape.email.parse(form.email);
        const { error } = await browserDb().auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/redefinir-senha`,
        });
        if (error) throw error;
        setMessage(
          "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.",
        );
        return;
      }
      if (mode === "redefinir") {
        const password = loginSchema.shape.password.parse(form.password);
        const { error } = await browserDb().auth.updateUser({ password });
        if (error) throw error;
        setMessage("Senha atualizada. Você já pode continuar.");
        return;
      }
      if (!staff) {
        const credentials = phoneLoginSchema.parse({
          ...form,
          telefone: phone,
        });
        const response = await fetch("/api/auth/telefone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        location.assign(
          result.must_change_password
            ? `/trocar-senha?required=1&next=${encodeURIComponent(next)}`
            : next,
        );
        return;
      }
      const db = browserDb();
      const { data, error } = await db.auth.signInWithPassword(
        loginSchema.parse(form),
      );
      if (error) throw error;
      const { data: profile } = await db
        .from("profiles")
        .select("must_change_password")
        .eq("id", data.user.id)
        .single();
      location.assign(
        profile?.must_change_password
          ? `/trocar-senha?required=1&next=${encodeURIComponent(next)}`
          : next,
      );
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  if (mode === "cadastro")
    return (
      <div className="auth">
        <QuickSignup onComplete={() => location.assign(next)} />
        <Link href={`/login?next=${encodeURIComponent(next)}`}>
          Já tenho uma conta
        </Link>
      </div>
    );
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
      <h1>
        {mode === "login"
          ? "Bem-vindo de volta"
          : mode === "recuperar"
            ? "Esqueci minha senha"
            : "Crie uma nova senha"}
      </h1>
      {mode !== "redefinir" && (
        <div className="row auth-mode">
          <button
            className={`button ${staff ? "outline" : ""}`}
            onClick={() => {
              setStaff(false);
              setError("");
            }}
          >
            Sou cliente
          </button>
          <button
            className={`button ${staff ? "" : "outline"}`}
            onClick={() => {
              setStaff(true);
              setError("");
            }}
          >
            Sou da equipe
          </button>
        </div>
      )}
      {mode === "recuperar" && !staff ? (
        <p role="status" className="muted">
          Para recuperar sua senha, fale com a barbearia. A equipe fornecerá uma
          senha provisória, que você deverá trocar no próximo acesso.
        </p>
      ) : (
        <form onSubmit={submit}>
          {mode !== "redefinir" &&
            (staff ? (
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            ) : (
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
            ))}
          {mode !== "recuperar" && (
            <PasswordInput
              autoComplete={
                mode === "redefinir" ? "new-password" : "current-password"
              }
            />
          )}
          <button className="button full" disabled={busy}>
            {busy
              ? "Aguarde…"
              : mode === "recuperar"
                ? "Enviar link de recuperação"
                : mode === "redefinir"
                  ? "Salvar nova senha"
                  : "Entrar"}
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <div className="auth-links">
        <Link href={`/cadastro?next=${encodeURIComponent(next)}`}>
          Criar uma conta
        </Link>
        <Link href={`/esqueci-senha${staff ? "?equipe=1" : ""}`}>
          Esqueci minha senha
        </Link>
      </div>
      {mode === "redefinir" && message && (
        <Link className="button" href="/">
          Continuar para agendar
        </Link>
      )}
    </section>
  );
}
