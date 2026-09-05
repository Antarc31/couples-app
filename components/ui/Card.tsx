import type { HTMLAttributes } from "react";

export type CardGradient = "rose" | "violet" | "teal" | "amber" | "indigo" | "coral";

// "amber" è chiaro (giallo/arancio): serve testo scuro sopra, non bianco
// come le altre cinque sfumature — le uniche due eccezioni gestite qui,
// così chi usa <Card gradient="amber"> non deve ricordarsi di aggiungere
// una classe di testo a parte.
const GRADIENT_TEXT: Record<CardGradient, string> = {
  rose: "text-white",
  violet: "text-white",
  teal: "text-white",
  amber: "text-[#3a2100]",
  indigo: "text-white",
  coral: "text-white",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Restyling design brief v2 (vedi
   * https://claude.ai/code/artifact/8965fdcf-b344-4c66-9a3d-345904c83cc5):
   * card "piena" di colore invece del bianco piatto di sempre, riservata ai
   * contenuti che meritano risalto (pensiero del giorno, countdown, quiz,
   * sorprese...). Omessa: comportamento IDENTICO a prima, `bg-surface`
   * bianco — ogni uso esistente di `<Card>` nel resto dell'app resta
   * invariato finché non viene aggiornato esplicitamente a usarla.
   */
  gradient?: CardGradient;
}

export default function Card({ gradient, className = "", style, ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-app)] p-4 shadow-[var(--shadow-soft)] ${
        gradient ? GRADIENT_TEXT[gradient] : "bg-surface"
      } ${className}`}
      style={gradient ? { backgroundImage: `var(--grad-${gradient})`, ...style } : style}
      {...props}
    />
  );
}
