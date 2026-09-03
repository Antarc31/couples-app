"use client";

import { useState, type InputHTMLAttributes } from "react";
import Input from "@/components/ui/Input";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Campo password con toggle mostra/nascondi (richiesto dall'utente su ogni
 * campo password dell'app: login, signup, reset). Wrapper attorno a Input
 * invece di duplicarne lo stile — il toggle è solo un bottone posizionato
 * sopra, `pr-12` lascia lo spazio perché il testo digitato non ci finisca
 * sotto.
 */
export default function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={`pr-12 ${className}`} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Nascondi password" : "Mostra password"}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-base"
      >
        {visible ? "🙈" : "👁️"}
      </button>
    </div>
  );
}
