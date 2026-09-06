import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-app)] font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-couple text-surface shadow-[var(--shadow-soft)] hover:brightness-105",
  secondary:
    "bg-surface text-ink border border-dashed border-[color:var(--color-border)] hover:bg-partner-a-soft/40",
  ghost: "text-ink-soft hover:text-ink",
};

const sizes = {
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-6 text-base",
  sm: "h-9 px-4 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof sizes;
}

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
