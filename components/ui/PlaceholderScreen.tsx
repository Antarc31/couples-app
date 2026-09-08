interface PlaceholderScreenProps {
  emoji: string;
  title: string;
  description: string;
}

/**
 * Placeholder minimo per le sezioni previste dalla navigazione ma non ancora
 * costruite in Fase 1 (Appuntamenti, Wishlist — vedi docs/PLAN.md roadmap,
 * arrivano in Fase 2). Serve solo a rendere la tab bar completa e navigabile
 * fin da subito.
 */
export default function PlaceholderScreen({ emoji, title, description }: PlaceholderScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-couple-soft text-3xl">
        {emoji}
      </span>
      <h1 className="text-xl font-extrabold text-ink">{title}</h1>
      <p className="text-sm text-ink-soft">{description}</p>
      <span className="mt-2 rounded-full bg-base px-3 py-1 text-xs font-semibold text-ink-soft">
        In arrivo nella Fase 2
      </span>
    </div>
  );
}
