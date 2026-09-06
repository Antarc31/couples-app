import type { InputHTMLAttributes } from "react";

export default function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-12 w-full min-w-0 rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-4 text-[15px] text-ink placeholder:text-ink-soft outline-none transition focus:border-solid focus:border-partner-a focus:ring-2 focus:ring-partner-a-soft ${className}`}
      {...props}
    />
  );
}
