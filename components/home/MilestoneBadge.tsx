import { Trophy } from "@/components/ui/icons";

interface MilestoneBadgeProps {
  nextMilestone: { label: string; daysUntil: number } | null;
}

/**
 * Banner per il prossimo traguardo "giorni insieme" (100 giorni, 1 anno...),
 * stesso trattamento visivo di CountdownHeader (stesso token colore/stesso
 * layout a badge), solo l'icona cambia per distinguerlo dal countdown
 * compleanno/anniversario. Nessun output se non c'è una
 * relationship_start_date impostata.
 */
export default function MilestoneBadge({ nextMilestone }: MilestoneBadgeProps) {
  if (!nextMilestone) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-app)] px-4 py-3 text-white"
      style={{ backgroundImage: "var(--grad-plum)" }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/25">
        <Trophy size={17} strokeWidth={2.2} />
      </div>
      <p className="text-sm font-bold">
        {nextMilestone.daysUntil === 0 ? "Oggi" : `Tra ${nextMilestone.daysUntil} giorni`}{" "}
        <span className="font-semibold text-white/85">· {nextMilestone.label}</span>
      </p>
    </div>
  );
}
