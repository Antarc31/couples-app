import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * "Paper card" del redesign "Diario di coppia": sfondo carta, bordo
 * TRATTEGGIATO (non solido) — il contenitore base per quasi ogni blocco
 * dell'app. Sfondo letto da --card-tint (var CSS, default = --color-surface,
 * la stessa carta neutra di sempre): una Card dentro un wrapper .theme-*
 * (vedi app/globals.css) prende automaticamente il pastello di quel tema
 * senza bisogno di un prop dedicato — un widget/pagina "a colore diverso"
 * si ottiene avvolgendolo in .theme-X, non passando un colore qui.
 */
export default function Card({ className = "", style, ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-app)] border border-dashed border-[color:var(--color-border)] p-4 shadow-[var(--shadow-card)] ${className}`}
      style={{ backgroundColor: "var(--card-tint)", ...style }}
      {...props}
    />
  );
}
