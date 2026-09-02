interface MilestoneBadgeProps {
  nextMilestone: { label: string; daysUntil: number } | null;
}

/**
 * Pillola per il prossimo traguardo "giorni insieme" (100 giorni, 1 anno...),
 * stesso trattamento visivo di CountdownHeader (stessa pillola/token colore),
 * emoji diversa per distinguerla dal countdown compleanno/anniversario.
 * Nessun output se non c'è una relationship_start_date impostata.
 */
export default function MilestoneBadge({ nextMilestone }: MilestoneBadgeProps) {
  if (!nextMilestone) return null;
  return (
    <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-special-soft px-3 py-1.5 text-xs font-semibold text-ink">
      🏆 {nextMilestone.daysUntil === 0 ? "Oggi" : `tra ${nextMilestone.daysUntil} giorni`}: {nextMilestone.label}
    </p>
  );
}
