"use client";

import { useEffect } from "react";

/**
 * Registra il service worker minimale (public/sw.js) per l'installabilità
 * PWA. Componente client, montato una sola volta nel root layout.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Registrazione service worker fallita:", err);
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
