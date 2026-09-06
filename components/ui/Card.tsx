import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * "Paper card" del redesign "Diario di coppia": sfondo carta (bg-surface),
 * bordo TRATTEGGIATO (non solido) — il contenitore base per quasi ogni
 * blocco dell'app. Niente più tinte personalizzate per widget (il tema
 * scuro dei giri precedenti le usava per differenziare le card di Home):
 * qui la personalità arriva da sticker/polaroid/tratteggi, ogni card resta
 * la stessa carta chiara.
 */
export default function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-app)] border border-dashed border-[color:var(--color-border)] bg-surface p-4 shadow-[var(--shadow-card)] ${className}`}
      {...props}
    />
  );
}
