import { PartyPopper } from "@/components/ui/icons";

interface CountdownHeaderProps {
  nextSpecial: { label: string; daysUntil: number } | null;
}

/**
 * Banner per la prossima data speciale (compleanno/anniversario/
 * mesiversario). Non più una pillola stretta di testo — un badge
 * circolare per l'icona più spazio intorno, stesso trattamento di
 * MilestoneBadge (stesso token colore: sono la stessa famiglia di
 * contenuto, "countdown a qualcosa che conta"). Nessun output se non c'è
 * una prossima data speciale.
 */
export default function CountdownHeader({ nextSpecial }: CountdownHeaderProps) {
  if (!nextSpecial) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-app)] px-4 py-3 text-white"
      style={{ backgroundImage: "var(--grad-plum)" }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/25">
        <PartyPopper size={17} strokeWidth={2.2} />
      </div>
      <p className="text-sm font-bold">
        {nextSpecial.daysUntil === 0 ? "Oggi" : `Tra ${nextSpecial.daysUntil} giorni`}{" "}
        <span className="font-semibold text-white/85">· {nextSpecial.label}</span>
      </p>
    </div>
  );
}
