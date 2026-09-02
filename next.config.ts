import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permette di raggiungere il dev server dal telefono via IP locale (es.
  // per testare da mobile sulla stessa rete Wi-Fi) — senza questo, Next.js
  // blocca per sicurezza le risorse JS/HMR richieste da un'origine diversa
  // da localhost, causando hydration incompleta e la sessione che non
  // "tiene" dopo il login. Solo IP di rete privata (192.168.x.x), non un
  // rischio in dev locale.
  allowedDevOrigins: ["192.168.1.7"],
};

export default nextConfig;
