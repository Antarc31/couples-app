import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * `bg-surface` (il token) è ora chiaro ovunque nell'app (tema scuro
 * globale, vedi app/globals.css) — una card senza sfondo personalizzato
 * finisce quindi "chiara sopra scuro" e le serve testo scuro sopra
 * (`.on-surface`, che reimposta text-ink/text-ink-soft). Chi invece passa
 * un proprio `style.backgroundColor` (i widget di Home con la loro tinta
 * couple-tint) sa già di che colore ha bisogno il testo e non riceve
 * questa classe — evita di dover pensare a "on-surface" ovunque nel resto
 * del codebase: la scelta corretta è quella di default.
 */
export default function Card({ className = "", style, ...props }: CardProps) {
  const hasCustomBackground = Boolean(style?.backgroundColor);
  return (
    <div
      className={`rounded-[var(--radius-app)] bg-surface p-4 shadow-[var(--shadow-soft)] ${hasCustomBackground ? "" : "on-surface"} ${className}`}
      style={style}
      {...props}
    />
  );
}
