import IconBadge from "@/components/ui/IconBadge";
import { PartyPopper } from "@/components/ui/icons";

interface CountdownHeaderProps {
  nextSpecial: { label: string; daysUntil: number } | null;
}

/**
 * Banner per la prossima data speciale (compleanno/anniversario/
 * mesiversario). Tinta leggera couple-soft (non bianco): stessa famiglia
 * dell'accento "couple" usato ovunque nell'app, solo più tenue — badge
 * icona a cerchio bianco perché altrimenti si confonderebbe nello sfondo.
 * Stesso trattamento di MilestoneBadge (stessa famiglia di contenuto,
 * "countdown a qualcosa che conta"). Nessun output se non c'è una
 * prossima data speciale.
 */
export default function CountdownHeader({ nextSpecial }: CountdownHeaderProps) {
  if (!nextSpecial) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-app)] px-4 py-3 shadow-[var(--shadow-soft)]"
      style={{ backgroundColor: "var(--color-couple-soft)" }}
    >
      <IconBadge icon={PartyPopper} variant="onTint" />
      <p className="text-sm font-bold text-ink">
        {nextSpecial.daysUntil === 0 ? "Oggi" : `Tra ${nextSpecial.daysUntil} giorni`}{" "}
        <span className="font-semibold text-ink-soft">· {nextSpecial.label}</span>
      </p>
    </div>
  );
}
