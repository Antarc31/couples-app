"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string;
  /** "coppia" aggiunge un'animazione di ingresso più marcata ("eco emotivo") oltre al colore. */
  variant?: "neutral" | "coppia";
  durationMs?: number;
  onDismiss: () => void;
}

/**
 * Toast di conferma transiente — prima e unica implementazione nel
 * progetto (nessun sistema di feedback esisteva, verificato). Auto-dismiss
 * interno via timer, nessuno stato posseduto da chi lo monta.
 */
export default function Toast({ message, variant = "neutral", durationMs = 2500, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-full px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow-soft)] ${
        variant === "coppia" ? "animate-toast-pop bg-couple text-white" : "animate-toast-in bg-ink text-white"
      }`}
    >
      {message}
    </div>
  );
}
