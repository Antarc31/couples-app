"use client";

/**
 * Form di modifica del Profilo. Ogni campo è una sezione Card indipendente
 * col proprio stato di salvataggio/errore (stesso pattern ripetuto per
 * Nickname, Email, Data di nascita, Data di inizio relazione):
 *   - Nickname: sempre visibile, scrive su `profiles.display_name`
 *     (lib/profile-actions.ts -> updateDisplayName).
 *   - Email: sempre visibile, richiede conferma via link mandato al nuovo
 *     indirizzo (lib/auth-actions.ts -> updateEmail, Supabase Auth) — non
 *     diventa effettiva subito, quindi qui NON si aggiorna otticamente il
 *     campo né si chiama router.refresh() dopo il submit (l'email in
 *     getCurrentCoupleData() resta quella vecchia finché non si conferma).
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
 * si limita a chiamare le azioni e a fare `router.refresh()` dopo un
 * salvataggio riuscito (tranne per l'email, vedi sopra), così Home
 * (countdown "prossima data speciale") e qualunque altro dato
 * server-derivato si aggiornano. Niente `window.confirm`/`alert` nativi,
 * coerente con lo stile del resto dell'app (vedi EventDetailSheet.tsx).
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { updateBirthDate, setRelationshipStartDate, updateDisplayName } from "@/lib/profile-actions";
import { updateEmail } from "@/lib/auth-actions";

interface ProfileEditFormProps {
  /** profiles.display_name corrente, o null se non ancora impostato. */
  displayName: string | null;
  /** auth.users.email corrente. */
  email: string;
  /** profiles.birth_date corrente (ISO 'YYYY-MM-DD'), o null se non ancora impostata. */
  birthDate: string | null;
  /** true se l'utente ha un partner accoppiato — controlla la visibilità della sezione anniversario. */
  isPaired: boolean;
  /** couples.relationship_start_date corrente (ISO 'YYYY-MM-DD'), o null se non ancora impostata. Ignorato se !isPaired. */
  relationshipStartDate: string | null;
}

export default function ProfileEditForm({
  displayName,
  email,
  birthDate,
  isPaired,
  relationshipStartDate,
}: ProfileEditFormProps) {
  const router = useRouter();

  const [displayNameValue, setDisplayNameValue] = useState(displayName ?? "");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [displayNameSaved, setDisplayNameSaved] = useState(false);

  const [emailValue, setEmailValue] = useState(email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailRequested, setEmailRequested] = useState(false);

  const [birthDateValue, setBirthDateValue] = useState(birthDate ?? "");
  const [savingBirthDate, setSavingBirthDate] = useState(false);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [birthDateSaved, setBirthDateSaved] = useState(false);

  const [relationshipDateValue, setRelationshipDateValue] = useState(relationshipStartDate ?? "");
  const [savingRelationshipDate, setSavingRelationshipDate] = useState(false);
  const [relationshipDateError, setRelationshipDateError] = useState<string | null>(null);
  const [relationshipDateSaved, setRelationshipDateSaved] = useState(false);

  async function handleDisplayNameSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingDisplayName(true);
    setDisplayNameError(null);
    setDisplayNameSaved(false);

    const result = await updateDisplayName(displayNameValue);

    setSavingDisplayName(false);
    if (result !== true) {
      setDisplayNameError(result.error);
      return;
    }
    setDisplayNameSaved(true);
    router.refresh();
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    setEmailError(null);
    setEmailRequested(false);

    const result = await updateEmail(emailValue);

    setSavingEmail(false);
    if ("error" in result) {
      setEmailError(result.error);
      return;
    }
    setEmailRequested(true);
  }

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
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Nickname</p>
        <form onSubmit={handleDisplayNameSubmit} className="flex flex-col gap-2">
          <Input
            type="text"
            value={displayNameValue}
            onChange={(e) => {
              setDisplayNameValue(e.target.value);
              setDisplayNameSaved(false);
            }}
            aria-label="Nickname"
          />
          {displayNameError && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{displayNameError}</p>
          )}
          {displayNameSaved && !displayNameError && <p className="text-sm text-ink-soft">Salvato ✓</p>}
          <Button type="submit" variant="secondary" disabled={savingDisplayName}>
            {savingDisplayName ? "Salvo…" : "Salva"}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Email</p>
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
          <Input
            type="email"
            value={emailValue}
            onChange={(e) => {
              setEmailValue(e.target.value);
              setEmailRequested(false);
            }}
            aria-label="Email"
          />
          {emailError && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{emailError}</p>}
          {emailRequested && !emailError && (
            <p className="text-sm text-ink-soft">
              Ti abbiamo mandato un'email di conferma al nuovo indirizzo: il cambio sarà effettivo solo dopo averla
              confermata.
            </p>
          )}
          <Button type="submit" variant="secondary" disabled={savingEmail || emailValue.trim() === email}>
            {savingEmail ? "Invio…" : "Salva"}
          </Button>
        </form>
      </Card>

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
