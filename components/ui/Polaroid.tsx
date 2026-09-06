import type { ReactNode } from "react";

interface PolaroidProps {
  /** Contenuto della "foto" (es. <img>, o un placeholder) — riempie il riquadro interno. */
  children: ReactNode;
  /** Didascalia sotto la foto, dentro il bordo di carta — testo a mano (Caveat). */
  caption?: ReactNode;
  rotate?: number;
  className?: string;
}

/**
 * Cornice foto in stile Polaroid dello scrapbook "Diario di coppia":
 * bordo di carta spesso (più spesso in basso, per la didascalia),
 * rotazione leggera, ombra marcata.
 */
export default function Polaroid({ children, caption, rotate = -3, className = "" }: PolaroidProps) {
  return (
    <div
      className={`relative flex flex-col rounded-sm bg-surface p-2.5 pb-7 shadow-[var(--shadow-strong)] ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div className="flex-1 overflow-hidden rounded-[2px]">{children}</div>
      {caption && <p className="mt-2 text-center font-hand leading-tight text-ink">{caption}</p>}
    </div>
  );
}
