import type { ComponentType } from "react";

interface IconBadgeProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  size?: number;
  /**
   * "soft": bg-couple-soft/text-couple, per badge su card bianca.
   * "onColor": bianco translucido, per badge sopra una card a tinta piena e
   * scura (vedi l'hero "Ricordi").
   * "onTint": cerchio bianco pieno/icona couple, per badge sopra una card
   * già tinta leggera di couple-soft (altrimenti si confonderebbe nello
   * sfondo, essendo lo stesso colore).
   */
  variant?: "soft" | "onColor" | "onTint";
  className?: string;
}

/**
 * Badge circolare per le intestazioni dei widget di Home — stesso identico
 * accento ovunque (corallo "couple", già quello di bottoni/link/FAB in
 * tutta l'app), non un colore diverso per widget — è questa ripetizione a
 * tenere la Home connessa al resto.
 */
export default function IconBadge({ icon: Icon, size = 36, variant = "soft", className = "" }: IconBadgeProps) {
  const tone =
    variant === "onColor" ? "bg-white/25 text-white" : variant === "onTint" ? "bg-white text-couple" : "bg-couple-soft text-couple";
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full ${tone} ${className}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </div>
  );
}
