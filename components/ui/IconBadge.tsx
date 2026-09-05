import type { ComponentType } from "react";

interface IconBadgeProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  size?: number;
  className?: string;
}

/**
 * Badge circolare per le intestazioni dei widget di Home — stesso identico
 * trattamento ovunque (bg-couple-soft + icona text-couple), lo stesso già
 * usato per le righe di AppointmentsView e il badge di Login/ResetPassword.
 * Corregge il redesign iniziale, che aveva dato un colore diverso a ogni
 * widget: qui c'è UN SOLO accento in tutta l'app (il corallo "couple", già
 * quello di bottoni/link/FAB ovunque), niente hue diversi da un widget
 * all'altro — è questa ripetizione a tenere la Home connessa al resto.
 */
export default function IconBadge({ icon: Icon, size = 36, className = "" }: IconBadgeProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-couple-soft text-couple ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </div>
  );
}
