import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export default function Card({ className = "", ...props }: CardProps) {
  return <div className={`rounded-[var(--radius-app)] bg-surface p-4 shadow-[var(--shadow-soft)] ${className}`} {...props} />;
}
