import type { ReactNode } from "react";

interface StickerProps {
  children: ReactNode;
  /** Rotazione in gradi (il brief indica una variazione tra -6° e 6° a seconda dell'uso). */
  rotate?: number;
  className?: string;
}

/**
 * Adesivo ruotato dello scrapbook "Diario di coppia": bordo tratteggiato
 * accent, sfondo accentSoft, ombra più marcata delle card normali — per tag
 * di stato ("oggi"), il badge traguardo in Home, e altri elementi che
 * "sporgono" da una card.
 */
export default function Sticker({ children, rotate = -4, className = "" }: StickerProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-[color:var(--color-couple)] bg-couple-soft px-3 py-1.5 text-ink shadow-[var(--shadow-strong)] ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </div>
  );
}
