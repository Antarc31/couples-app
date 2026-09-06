"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { momentIsBusy, toDateKey, toTimeString } from "@/lib/calendar-dates";
import {
  createAppointmentIdea,
  createConfirmedAppointment,
  confirmAppointment,
  updateAppointment,
  type Appointment,
} from "@/lib/appointments-actions";
import { listCoupleEventsInRange, updateCalendarEvent } from "@/lib/calendar-actions";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SlotSuggestions from "@/components/calendar/SlotSuggestions";

export type AppointmentFormMode = "idea" | "confirmed" | "transform" | "edit";

// Testo libero, non un enum chiuso (calendar_events.tag / appointments.tag
// sono entrambi testo libero per scelta di backend2 — vedi commento in
// supabase/migrations/20260901010000_appointments.sql).
const TAG_SUGGESTIONS = ["viaggio", "attivita", "ristorante"];

interface AppointmentFormModalProps {
  mode: AppointmentFormMode;
  /** Riga esistente: presente per "transform" (l'idea da confermare) e "edit". */
  initial?: Appointment;
  /**
   * calendar_event collegato a `initial`, se confermato — `Appointment` non
   * porta data/ora (vivono su calendar_events), quindi in modalità "edit" su
   * un confermato serve questo per precompilare i campi data/ora.
   */
  initialEvent?: { startsAt: string; endsAt: string | null; allDay: boolean };
  onClose: () => void;
  /** Chiamato a successo salvataggio: il chiamante ricarica la lista e chiude. */
  onSaved: () => void;
}

/**
 * Form per creare un'idea, un appuntamento confermato direttamente, oppure
 * trasformare un'idea in confermato (stesso pattern visivo di
 * components/calendar/EventFormModal.tsx). Collegato a lib/appointments-actions.ts
 * (dati reali, tabella `appointments` live dal 2026-09-01).
 *
 * mode "confirmed" (nuovo appuntamento dal FAB, non da un'idea) usa
 * createConfirmedAppointment — un solo INSERT già status='confermato', non
 * il giro idea->conferma. Backend2: la versione precedente componeva
 * createAppointmentIdea+confirmAppointment (funzionava, ma passava per uno
 * stato 'idea' intermedio inutile — un INSERT+UPDATE di troppo e due eventi
 * Realtime invece di uno). mode "transform" resta correttamente a due
 * scritture separate (updateAppointment poi confirmAppointment): lì l'idea
 * esiste già, quindi non c'è nulla da "creare già confermato".
 */
export default function AppointmentFormModal({
  mode,
  initial,
  initialEvent,
  onClose,
  onSaved,
}: AppointmentFormModalProps) {
  const isConfirmedForm =
    mode === "confirmed" || mode === "transform" || (mode === "edit" && initial?.status === "confermato");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [date, setDate] = useState(toDateKey(initialEvent ? new Date(initialEvent.startsAt) : new Date()));
  const [startTime, setStartTime] = useState(
    initialEvent
      ? `${String(new Date(initialEvent.startsAt).getHours()).padStart(2, "0")}:${String(new Date(initialEvent.startsAt).getMinutes()).padStart(2, "0")}`
      : "20:00",
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rilevamento sovrapposizione automatico (nessun checkbox), versione
  // puntuale: questo form non raccoglie mai un orario di fine, quindi si usa
  // momentIsBusy invece di overlapsAnyEvent — vedi piano "buchi comuni".
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [momentBusy, setMomentBusy] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!isConfirmedForm) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("couple_id").eq("id", user.id).maybeSingle();
      if (!cancelled) setCoupleId(profile?.couple_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isConfirmedForm]);

  useEffect(() => {
    if (!isConfirmedForm || !coupleId || !date || !startTime) {
      setMomentBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59`);
      const result = await listCoupleEventsInRange(coupleId, dayStart, dayEnd);
      if (cancelled || "error" in result) return;
      const excludeId = initial?.calendarEventId ?? undefined;
      const events = excludeId ? result.filter((ev) => ev.id !== excludeId) : result;
      setMomentBusy(momentIsBusy(events, new Date(`${date}T${startTime}:00`)));
    })();
    return () => {
      cancelled = true;
    };
  }, [isConfirmedForm, coupleId, date, startTime, initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    const costValue = cost.trim() ? Number(cost) : undefined;

    if (mode === "idea") {
      const result = await createAppointmentIdea({
        title: title.trim(),
        tag: tag.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSaving(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
      return;
    }

    const startsAt = new Date(`${date}T${startTime}:00`).toISOString();

    if (mode === "edit") {
      if (!initial) {
        setSaving(false);
        setError("Appuntamento non trovato.");
        return;
      }
      const updateResult = await updateAppointment(initial.id, {
        title: title.trim(),
        location: location.trim() || null,
        cost: costValue ?? null,
        notes: notes.trim() || null,
        tag: tag.trim() || null,
      });
      if ("error" in updateResult) {
        setSaving(false);
        setError(updateResult.error);
        return;
      }
      if (initial.status === "confermato" && initial.calendarEventId) {
        const eventResult = await updateCalendarEvent(initial.calendarEventId, {
          title: title.trim(),
          startsAt,
        });
        if ("error" in eventResult) {
          setSaving(false);
          setError(eventResult.error);
          return;
        }
      }
      setSaving(false);
      onSaved();
      return;
    }

    if (mode === "confirmed") {
      const result = await createConfirmedAppointment(
        {
          title: title.trim(),
          location: location.trim() || undefined,
          cost: costValue,
          notes: notes.trim() || undefined,
          tag: tag.trim() || undefined,
        },
        { startsAt, category: "coppia" },
      );
      setSaving(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
      return;
    }

    // mode === "transform": salva prima gli eventuali cambi ai campi
    // descrittivi (l'utente può averli editati nel form), poi collega
    // l'evento calendario. Due scritture separate lato client per scelta di
    // design di backend2 (vedi commento in testa alla migration), non una
    // RPC/trigger DB.
    if (!initial) {
      setSaving(false);
      setError("Idea non trovata.");
      return;
    }
    const updateResult = await updateAppointment(initial.id, {
      title: title.trim(),
      location: location.trim() || null,
      cost: costValue ?? null,
      notes: notes.trim() || null,
      tag: tag.trim() || null,
    });
    if ("error" in updateResult) {
      setSaving(false);
      setError(updateResult.error);
      return;
    }
    const confirmedResult = await confirmAppointment(initial.id, { startsAt, category: "coppia" }, title.trim());
    setSaving(false);
    if ("error" in confirmedResult) {
      setError(confirmedResult.error);
      return;
    }
    onSaved();
  }

  const heading =
    mode === "idea"
      ? "Nuova idea"
      : mode === "transform"
        ? "Trasforma in appuntamento"
        : mode === "edit"
          ? "Modifica appuntamento"
          : "Nuovo appuntamento";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <h2 className="mb-4 text-lg font-extrabold text-ink">{heading}</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            type="text"
            placeholder="Titolo (es. Cena da Marco)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">Tag (opzionale)</p>
            <Input type="text" placeholder="es. viaggio, ristorante…" value={tag} onChange={(e) => setTag(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TAG_SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(t)}
                  className="rounded-full bg-partner-a-soft/50 px-2.5 py-1 text-xs font-medium capitalize text-ink-soft hover:bg-partner-a-soft"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {isConfirmedForm && (
            <>
              <div className="flex gap-3">
                <label className="flex-1 text-xs font-semibold text-ink-soft">
                  Data
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1" />
                </label>
                <label className="flex-1 text-xs font-semibold text-ink-soft">
                  Ora
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1" />
                </label>
              </div>

              {momentBusy && (
                <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-3">
                  <p className="text-xs font-semibold text-danger">⚠️ Si sovrappone a un impegno già in calendario</p>
                  {!showSuggestions ? (
                    <button
                      type="button"
                      onClick={() => setShowSuggestions(true)}
                      className="self-start rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm transition active:scale-95"
                    >
                      Suggerisci slot orario
                    </button>
                  ) : coupleId ? (
                    <SlotSuggestions
                      coupleId={coupleId}
                      from={new Date(`${date}T00:00:00`)}
                      daysAhead={7}
                      excludeEventId={initial?.calendarEventId ?? undefined}
                      onPick={(start) => {
                        setDate(toDateKey(start));
                        setStartTime(toTimeString(start));
                        setShowSuggestions(false);
                      }}
                    />
                  ) : null}
                </div>
              )}

              <Input
                type="text"
                placeholder="Luogo (opzionale)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Costo indicativo in € (opzionale)"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </>
          )}

          <textarea
            placeholder="Note (opzionale)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft outline-none focus:border-partner-a focus:ring-2 focus:ring-partner-a-soft"
          />

          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" className="flex-1" disabled={saving || !title.trim()}>
              {saving
                ? "Salvo…"
                : mode === "transform"
                  ? "Conferma"
                  : mode === "edit"
                    ? "Salva modifiche"
                    : "Salva"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
