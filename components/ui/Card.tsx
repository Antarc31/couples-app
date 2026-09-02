import type { HTMLAttributes } from "react";

export default function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[var(--radius-app)] bg-surface p-4 shadow-[var(--shadow-soft)] ${className}`}
      {...props}
    />
  );
}
