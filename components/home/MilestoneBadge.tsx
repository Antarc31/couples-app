import IconBadge from "@/components/ui/IconBadge";
import { Trophy } from "@/components/ui/icons";

interface MilestoneBadgeProps {
  nextMilestone: { label: string; daysUntil: number } | null;
}

/**
 * Banner per il prossimo traguardo "giorni insieme" (100 giorni, 1 anno...),
 * stesso trattamento visivo di CountdownHeader (solo l'icona nel badge
 * cambia). Nessun output se non c'è una relationship_start_date impostata.
 */
export default function MilestoneBadge({ nextMilestone }: MilestoneBadgeProps) {
  if (!nextMilestone) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-app)] px-4 py-3 shadow-[var(--shadow-soft)]"
      style={{ backgroundColor: "var(--color-couple-soft)" }}
    >
      <IconBadge icon={Trophy} variant="onTint" />
      <p className="text-sm font-bold text-ink">
        {nextMilestone.daysUntil === 0 ? "Oggi" : `Tra ${nextMilestone.daysUntil} giorni`}{" "}
        <span className="font-semibold text-ink-soft">· {nextMilestone.label}</span>
      </p>
    </div>
  );
}
