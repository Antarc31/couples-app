"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/auth-actions";
import Button from "@/components/ui/Button";
import PasswordInput from "@/components/ui/PasswordInput";

/**
 * Form mostrato dopo il link di recupero password (app/(auth)/reset-password/page.tsx):
 * a quel punto app/auth/callback/route.ts ha già scambiato il `code` con una
 * sessione di recovery valida (stesso meccanismo della conferma email), quindi
 * updatePassword() può già chiamare supabase.auth.updateUser() senza bisogno
 * di altro. Nessuna guardia server-side sulla pagina: se la sessione di
 * recovery non c'è/è scaduta, updateUser() fallisce e l'errore viene
 * semplicemente mostrato qui, stesso livello di semplicità del resto
 * dell'app (vedi commento nella pagina).
 */
export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Le due password non coincidono.");
      return;
    }

    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">Scegli una nuova password per il tuo account.</p>
      <PasswordInput
        placeholder="Nuova password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
        autoFocus
      />
      <PasswordInput
        placeholder="Conferma nuova password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
      />

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <Button type="submit" size="lg" disabled={loading} className="mt-1">
        {loading ? "Un attimo…" : "Salva nuova password"}
      </Button>
    </form>
  );
}
