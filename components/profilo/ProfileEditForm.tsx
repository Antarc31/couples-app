"use client";

/**
 * Form di modifica del Profilo — piano approvato in
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md,
 * "Feature B — Eventi 'speciale' automatici". Sostituisce il blocco
 * read-only precedente in app/(app)/profilo/page.tsx (che mostrava solo la
 * data di inizio relazione in sola lettura).
 *
 * Due sezioni Card indipendenti, ciascuna col proprio stato di
 * salvataggio/errore:
 *   - Data di nascita: sempre visibile, scrive direttamente su
 *     `profiles.birth_date` (lib/profile-actions.ts -> updateBirthDate).
 *   - Data di inizio relazione: visibile SOLO se `isPaired` — la RPC
 *     set_relationship_start_date fallisce esplicitamente se l'utente non è
 *     accoppiato, stesso principio già usato per
 *     EventDetailSheet.canEdit (non mostrare un'azione destinata a
 *     fallire).
 *
 * Impostare l'una o l'altra data fa scattare lato DB la generazione/
 * aggiornamento automatico dell'evento calendario categoria 'speciale'
 * collegato (compleanno/anniversario) — questo componente non ne sa nulla,
 * si limita a chiamare le due azioni e a fare `router.refresh()` dopo un
 * salvataggio riuscito, così Home (countdown "prossima data speciale") e
 * qualunque altro dato server-derivato si aggiornano. Niente
 * `window.confirm`/`alert` nativi, coerente con lo stile del resto dell'app
 * (vedi EventDetailSheet.tsx).
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { updateBirthDate, setRelationshipStartDate } from "@/lib/profile-actions";

interface ProfileEditFormProps {
  /** profiles.birth_date corrente (ISO 'YYYY-MM-DD'), o null se non ancora impostata. */
  birthDate: string | null;
  /** true se l'utente ha un partner accoppiato — controlla la visibilità della sezione anniversario. */
  isPaired: boolean;
  /** couples.relationship_start_date corrente (ISO 'YYYY-MM-DD'), o null se non ancora impostata. Ignorato se !isPaired. */
  relationshipStartDate: string | null;
}

export default function ProfileEditForm({ birthDate, isPaired, relationshipStartDate }: ProfileEditFormProps) {
  const router = useRouter();

  const [birthDateValue, setBirthDateValue] = useState(birthDate ?? "");
  const [savingBirthDate, setSavingBirthDate] = useState(false);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [birthDateSaved, setBirthDateSaved] = useState(false);

  const [relationshipDateValue, setRelationshipDateValue] = useState(relationshipStartDate ?? "");
  const [savingRelationshipDate, setSavingRelationshipDate] = useState(false);
  const [relationshipDateError, setRelationshipDateError] = useState<string | null>(null);
  const [relationshipDateSaved, setRelationshipDateSaved] = useState(false);

  async function handleBirthDateSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingBirthDate(true);
    setBirthDateError(null);
    setBirthDateSaved(false);

    const result = await updateBirthDate(birthDateValue || null);

    setSavingBirthDate(false);
    if (result !== true) {
      setBirthDateError(result.error);
      return;
    }
    setBirthDateSaved(true);
    router.refresh();
  }

  async function handleRelationshipDateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!relationshipDateValue) {
      setRelationshipDateError("Seleziona una data.");
      return;
    }
    setSavingRelationshipDate(true);
    setRelationshipDateError(null);
    setRelationshipDateSaved(false);

    const result = await setRelationshipStartDate(relationshipDateValue);

    setSavingRelationshipDate(false);
    if (result !== true) {
      setRelationshipDateError(result.error);
      return;
    }
    setRelationshipDateSaved(true);
    router.refresh();
  }

  return (
    <>
      <Card className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Data di nascita</p>
        <form onSubmit={handleBirthDateSubmit} className="flex flex-col gap-2">
          <Input
            type="date"
            value={birthDateValue}
            onChange={(e) => {
              setBirthDateValue(e.target.value);
              setBirthDateSaved(false);
            }}
            aria-label="Data di nascita"
          />
          {birthDateError && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{birthDateError}</p>
          )}
          {birthDateSaved && !birthDateError && <p className="text-sm text-ink-soft">Salvata ✓</p>}
          <Button type="submit" variant="secondary" disabled={savingBirthDate}>
            {savingBirthDate ? "Salvo…" : "Salva"}
          </Button>
        </form>
      </Card>

      {isPaired && (
        <Card className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Data di inizio relazione</p>
          <form onSubmit={handleRelationshipDateSubmit} className="flex flex-col gap-2">
            <Input
              type="date"
              value={relationshipDateValue}
              onChange={(e) => {
                setRelationshipDateValue(e.target.value);
                setRelationshipDateSaved(false);
              }}
              aria-label="Data di inizio relazione"
            />
            {relationshipDateError && (
              <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{relationshipDateError}</p>
            )}
            {relationshipDateSaved && !relationshipDateError && (
              <p className="text-sm text-ink-soft">Salvata ✓</p>
            )}
            <Button type="submit" variant="secondary" disabled={savingRelationshipDate}>
              {savingRelationshipDate ? "Salvo…" : "Salva"}
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
