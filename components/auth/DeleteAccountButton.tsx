"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteOwnAccount } from "@/lib/auth-actions";

export default function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteOwnAccount();
    if ("error" in result) {
      setDeleting(false);
      setError(result.error);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-[var(--radius-app)] border border-danger px-5 py-3 text-[15px] font-semibold text-danger transition active:scale-[0.98]"
        >
          Elimina account
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-3">
          <p className="text-sm text-danger">
            Il tuo account verrà cancellato per sempre, insieme a TUTTI i dati della coppia —
            pensieri, foto, calendario, appuntamenti e wishlist condivisi — anche quelli creati dal
            tuo partner. Il suo account resterà attivo ma senza più l&apos;accoppiamento e senza
            questa cronologia. Questa azione non si può annullare.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="flex-1 rounded-[var(--radius-app)] bg-surface on-surface px-5 py-3 text-[15px] font-semibold text-ink border border-border transition active:scale-[0.98] disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-[var(--radius-app)] bg-danger px-5 py-3 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {deleting ? "Elimino…" : "Conferma eliminazione"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
