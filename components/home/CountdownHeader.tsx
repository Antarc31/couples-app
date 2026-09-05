import IconBadge from "@/components/ui/IconBadge";
import { PartyPopper } from "@/components/ui/icons";

interface CountdownHeaderProps {
  nextSpecial: { label: string; daysUntil: number } | null;
}

/**
 * Banner per la prossima data speciale (compleanno/anniversario/
 * mesiversario). Card bianca come tutte le altre — l'unico accento è il
 * badge dell'icona (vedi IconBadge), stesso identico trattamento di
 * MilestoneBadge: sono la stessa famiglia di contenuto, "countdown a
 * qualcosa che conta". Nessun output se non c'è una prossima data
 * speciale.
 */
export default function CountdownHeader({ nextSpecial }: CountdownHeaderProps) {
  if (!nextSpecial) return null;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-app)] bg-surface px-4 py-3 shadow-[var(--shadow-soft)]">
      <IconBadge icon={PartyPopper} />
      <p className="text-sm font-bold text-ink">
        {nextSpecial.daysUntil === 0 ? "Oggi" : `Tra ${nextSpecial.daysUntil} giorni`}{" "}
        <span className="font-semibold text-ink-soft">· {nextSpecial.label}</span>
      </p>
    </div>
  );
}
