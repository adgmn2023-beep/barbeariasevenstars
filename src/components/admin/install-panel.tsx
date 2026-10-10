"use client";
import { Share } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPanel() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">(
    "other",
  );
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(isIOS ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "other");
    setInstalled(
      matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true),
    );

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (platform === "other" && !installed) return null;

  async function install() {
    if (!prompt) {
      setMessage(
        "Abra o painel no Chrome atualizado e use o menu do navegador para instalar.",
      );
      return;
    }
    await prompt.prompt();
    const result = await prompt.userChoice;
    setPrompt(null);
    if (result.outcome === "accepted") setInstalled(true);
  }

  return (
    <section className="card admin-install">
      <h2>Seven Stars Admin</h2>
      {installed ? (
        <p className="success" role="status">
          Painel instalado neste dispositivo.
        </p>
      ) : (
        <button className="button outline" onClick={install}>
          Instalar painel
        </button>
      )}
      {platform === "ios" && !installed && (
        <div className="ios-install-guide">
          <p>No Safari do iPhone ou iPad:</p>
          <ol>
            <li>
              <Share size={20} aria-hidden="true" />
              <span>Compartilhar</span>
            </li>
            <li>
              <span className="add-home-icon" aria-hidden="true">
                +
              </span>
              <span>Adicionar à Tela de Início</span>
            </li>
          </ol>
        </div>
      )}
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
    </section>
  );
}