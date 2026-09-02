interface CountdownHeaderProps {
  nextSpecial: { label: string; daysUntil: number } | null;
}

/**
 * Pillola di countdown per la prossima data speciale (compleanno/
 * anniversario/mesiversario), unico contenuto rimasto qui — il saluto
 * testuale ("Buon pomeriggio, ... tu e ...") e il titolo "La vostra
 * dashboard" sono stati rimossi su richiesta esplicita dell'utente
 * (ridondanti/poco curati ora che la top bar persistente esiste). Nessun
 * output se non c'è una prossima data speciale.
 */
export default function CountdownHeader({ nextSpecial }: CountdownHeaderProps) {
  if (!nextSpecial) return null;
  return (
    <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-special-soft px-3 py-1.5 text-xs font-semibold text-ink">
      🎉 {nextSpecial.daysUntil === 0 ? "Oggi" : `tra ${nextSpecial.daysUntil} giorni`}: {nextSpecial.label}
    </p>
  );
}
