"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          setMessage(
            "Não foi possível preparar o app. Tente recarregar a página.",
          ),
        );
    setInstalled(matchMedia("(display-mode: standalone)").matches);
    const listener = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", listener);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", listener);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return (
    <section className="card narrow" style={{ marginTop: 24 }}>
      <h2>Seven Stars sempre por perto</h2>
      <p className="muted">
        Instale o app para acessar seus horários com um toque.
      </p>
      {installed ? (
        <p className="success">App instalado neste dispositivo.</p>
      ) : (
        <>
          <button
            className="button outline"
            onClick={async () => {
              if (prompt) {
                await prompt.prompt();
                const result = await prompt.userChoice;
                if (result.outcome === "accepted") setInstalled(true);
                setPrompt(null);
              } else
                setMessage(
                  "No iPhone: abra no Safari, toque em Compartilhar → Adicionar à Tela de Início. No Android ou computador: abra o menu do navegador e escolha Instalar app.",
                );
            }}
          >
            Instalar app
          </button>
          <p className="muted">
            iPhone: Compartilhar → Adicionar à Tela de Início.
          </p>
        </>
      )}
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
    </section>
  );
}
