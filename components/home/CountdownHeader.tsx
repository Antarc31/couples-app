import { PartyPopper } from "@/components/ui/icons";

interface CountdownHeaderProps {
  nextSpecial: { label: string; daysUntil: number } | null;
}

/**
 * Pillola di countdown per la prossima data speciale (compleanno/
 * anniversario/mesiversario). Restyling design brief v2: sfondo pieno
 * viola (stesso token di MilestoneBadge, sono la stessa famiglia di
 * contenuto — "countdown a qualcosa che conta") invece del pallido oro di
 * prima, icona Lucide invece dell'emoji 🎉. Nessun output se non c'è una
 * prossima data speciale.
 */
export default function CountdownHeader({ nextSpecial }: CountdownHeaderProps) {
  if (!nextSpecial) return null;
  return (
    <p
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white"
      style={{ backgroundImage: "var(--grad-violet)" }}
    >
      <PartyPopper size={13} strokeWidth={2.4} />
      {nextSpecial.daysUntil === 0 ? "Oggi" : `Tra ${nextSpecial.daysUntil} giorni`} · {nextSpecial.label}
    </p>
  );
}
