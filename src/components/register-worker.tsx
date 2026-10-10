"use client";
import { useEffect } from "react";
export function RegisterWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() =>
          console.warn("Não foi possível registrar o modo instalável."),
        );
  }, []);
  return null;
}
