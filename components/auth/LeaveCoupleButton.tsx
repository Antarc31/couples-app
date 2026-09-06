"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { leaveCouple } from "@/lib/auth-actions";

export default function LeaveCoupleButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    setLeaving(true);
    setError(null);
    const result = await leaveCouple();
    if ("error" in result) {
      setLeaving(false);
      setError(result.error);
      return;
    }
    router.push("/pairing");
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
          Lascia la coppia
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-3">
          <p className="text-sm text-danger">
            Calendario, appuntamenti, pensieri, foto e wishlist condivisi con il tuo partner
            verranno cancellati per sempre, per entrambi. Il tuo account resta attivo: potrai
            accoppiarti di nuovo con un nuovo codice. Questa azione non si può annullare.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={leaving}
              className="flex-1 rounded-[var(--radius-app)] bg-surface px-5 py-3 text-[15px] font-semibold text-ink border border-border transition active:scale-[0.98] disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleLeave}
              disabled={leaving}
              className="flex-1 rounded-[var(--radius-app)] bg-danger px-5 py-3 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {leaving ? "Esco…" : "Conferma uscita"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
