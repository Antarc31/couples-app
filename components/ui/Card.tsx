import type { HTMLAttributes } from "react";

/**
 * Un'unica tematica cromatica per tutta l'app: ogni sfumatura vive nello
 * spettro rosa → rosso → viola (mai blu o verde), i widget si distinguono
 * per tonalità, non per tinta diversa — vedi i token `--grad-*` in
 * globals.css per i valori esatti e a cosa è assegnato ciascuno.
 */
export type CardGradient = "rose" | "blush" | "crimson" | "plum" | "violet" | "coral";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Restyling design brief v2 (vedi
   * https://claude.ai/code/artifact/8965fdcf-b344-4c66-9a3d-345904c83cc5):
   * card "piena" di colore invece del bianco piatto di sempre, riservata ai
   * contenuti che meritano risalto (countdown, quiz, check-in, sorprese...).
   * Omessa: comportamento IDENTICO a prima, `bg-surface` bianco — ogni uso
   * esistente di `<Card>` nel resto dell'app resta invariato finché non
   * viene aggiornato esplicitamente a usarla.
   */
  gradient?: CardGradient;
}

export default function Card({ gradient, className = "", style, ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-app)] p-4 shadow-[var(--shadow-soft)] ${
        gradient ? "text-white" : "bg-surface"
      } ${className}`}
      style={gradient ? { backgroundImage: `var(--grad-${gradient})`, ...style } : style}
      {...props}
    />
  );
}
