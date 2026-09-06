import type { ComponentType } from "react";

interface IconBadgeProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  size?: number;
  /** Rotazione in gradi — usata per le righe "ticket" di Appuntamenti ("leggermente ruotata", vedi brief). */
  rotate?: number;
  className?: string;
}

/**
 * "Icon tile" del redesign "Diario di coppia": riquadro arrotondato pieno
 * accent, icona colore "paper" sopra — stesso trattamento per i badge dei
 * widget di Home, la campanella di AppTopBar, le righe "ticket" di
 * Appuntamenti. Sostituisce le vecchie varianti soft/onColor/onTint
 * (pensate per contrastare card tinte che non esistono più con questo
 * redesign): ogni card è ora la stessa carta chiara, un solo trattamento
 * di badge basta ovunque.
 */
export default function IconBadge({ icon: Icon, size = 36, rotate = 0, className = "" }: IconBadgeProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl bg-couple text-surface ${className}`}
      style={{ width: size, height: size, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </div>
  );
}
