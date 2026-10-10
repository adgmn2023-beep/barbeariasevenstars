"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { browserDb } from "@/lib/supabase/client";
import { loginSchema, readableError, safeNext } from "@/lib/validation";
import { loginEmail, phoneLoginSchema } from "@/lib/phone-auth";
import { PasswordInput } from "./password-input";
import { QuickSignup } from "./quick-signup";
export { phoneMask } from "@/lib/phone-auth";
export function AuthForm({
  mode,
}: {
  mode: "login" | "cadastro" | "recuperar" | "redefinir";
}) {
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [next, setNext] = useState("/");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    setNext(safeNext(query.get("next")));
    if (query.get("erro") === "link")
      setError("Este link é inválido ou expirou. Solicite um novo e-mail.");
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setRecoveryMessage("");
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      if (mode === "recuperar") {
        const identifier = String(form.identifier ?? "").trim();
        if (!identifier.includes("@")) {
          setRecoveryMessage(
            "Para recuperar a senha de cliente, fale com a barbearia. A equipe ajudará a recuperar seu acesso.",
          );
          return;
        }
        const email = loginSchema.shape.email.parse(identifier);
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
      const db = browserDb();
      const identifier = String(form.identifier ?? "").trim();
      const password = phoneLoginSchema.shape.password.parse(form.password);
      if (!identifier.includes("@"))
        phoneLoginSchema.shape.telefone.parse(identifier);
      const credentials = {
        email: loginEmail(identifier),
        password,
      };
      const { data, error } = await db.auth.signInWithPassword(credentials);
      if (error) throw error;
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("must_change_password")
        .eq("id", data.user.id)
        .single();
      if (profileError) throw profileError;
      location.assign(
        profile?.must_change_password
          ? `/trocar-senha?required=1&next=${encodeURIComponent(next)}`
          : next,
      );
    } catch (error) {
      setError(
        mode === "login"
          ? "Telefone/e-mail ou senha incorretos."
          : readableError(error),
      );
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
      <form onSubmit={submit}>
        {mode !== "redefinir" && (
          <label>
            Telefone ou e-mail
            <input
              name="identifier"
              type="text"
              autoComplete="username"
              inputMode="text"
              required
            />
          </label>
        )}
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
      {recoveryMessage && (
        <p role="status" className="muted">
          {recoveryMessage}
        </p>
      )}
      <div className="auth-links">
        <Link href={`/cadastro?next=${encodeURIComponent(next)}`}>
          Criar uma conta
        </Link>
        {mode === "login" && (
          <Link href="/esqueci-senha">Esqueci minha senha</Link>
        )}
      </div>
      {mode === "redefinir" && message && (
        <Link className="button" href="/">
          Continuar para agendar
        </Link>
      )}
    </section>
  );
}
