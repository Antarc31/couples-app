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
 * rotazione leggera, ombra marcata, un pezzo di nastro washi (righe
 * diagonali accent/accentSoft) che sporge dal bordo superiore.
 */
export default function Polaroid({ children, caption, rotate = -3, className = "" }: PolaroidProps) {
  return (
    <div
      className={`relative rounded-sm bg-surface p-2.5 pb-7 shadow-[var(--shadow-strong)] ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {/* Nastro washi: righe diagonali ripetute, ruotato indipendentemente dalla polaroid sotto. */}
      <div
        className="absolute -top-3 left-1/2 h-6 w-16 opacity-80"
        style={{
          transform: "translateX(-50%) rotate(-6deg)",
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--color-couple) 0 6px, var(--color-couple-soft) 6px 12px)",
        }}
      />
      <div className="overflow-hidden rounded-[2px]">{children}</div>
      {caption && <p className="mt-2 text-center font-hand text-ink">{caption}</p>}
    </div>
  );
}
