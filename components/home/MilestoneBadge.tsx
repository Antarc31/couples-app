import { Trophy } from "@/components/ui/icons";

interface MilestoneBadgeProps {
  nextMilestone: { label: string; daysUntil: number } | null;
}

/**
 * Pillola per il prossimo traguardo "giorni insieme" (100 giorni, 1 anno...).
 * Stesso trattamento di CountdownHeader (stesso token viola: sono la stessa
 * famiglia di contenuto, "countdown a qualcosa che conta"), solo l'icona
 * cambia per distinguerla dal countdown compleanno/anniversario. Nessun
 * output se non c'è una relationship_start_date impostata.
 */
export default function MilestoneBadge({ nextMilestone }: MilestoneBadgeProps) {
  if (!nextMilestone) return null;
  return (
    <p
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white"
      style={{ backgroundImage: "var(--grad-violet)" }}
    >
      <Trophy size={13} strokeWidth={2.4} />
      {nextMilestone.daysUntil === 0 ? "Oggi" : `Tra ${nextMilestone.daysUntil} giorni`} · {nextMilestone.label}
    </p>
  );
}
