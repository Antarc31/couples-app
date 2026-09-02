"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toDateKey } from "@/lib/calendar-dates";
import { createCalendarEvent, updateCalendarEvent } from "@/lib/calendar-actions";
import { createConfirmedAppointment } from "@/lib/appointments-actions";
import type { CalendarEventRow } from "@/lib/calendar-colors";
import type { EventCategory } from "@/types/database";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const CATEGORY_OPTIONS: { value: EventCategory; label: string; colorVar: string }[] = [
  { value: "personale", label: "Personale", colorVar: "var(--color-partner-a)" },
  { value: "coppia", label: "Di coppia", colorVar: "var(--color-couple)" },
];

const TAG_SUGGESTIONS = ["amici", "uni", "sport", "lavoro", "famiglia", "viaggio"];

/** yyyy-mm-dd → HH:mm locale, per popolare gli <input type="time"> in edit. */
function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface EventFormModalProps {
  coupleId: string;
  createdBy: string;
  defaultDate: Date;
  /** Default "create". "edit" precompila i campi da `initial` e chiama updateCalendarEvent. */
  mode?: "create" | "edit";
  /** Obbligatorio quando mode === "edit". */
  initial?: CalendarEventRow;
  onClose: () => void;
  /** Riceve la categoria salvata — usata dal chiamante per un toast di conferma differenziato. */
  onSaved: (category: EventCategory) => void;
}

/**
 * Form di creazione/modifica evento (piano UX "Gruppo Calendario/
 * Appuntamenti", punti 3 e 4).
 *
 * Punto 3: `mode`/`initial` (stesso pattern di AppointmentFormModal.tsx) per
 * riusare lo stesso form sia in creazione sia in modifica, invece di avere
 * due componenti quasi identici.
 *
 * Punto 4 (unificazione Calendario -> Appuntamenti per categoria "coppia"):
 * SOLO in creazione, scegliere categoria "coppia" mostra due campi opzionali
 * aggiuntivi (Luogo/Costo, stesso pattern UI di AppointmentFormModal.tsx per
 * i confermati) e il submit chiama `createConfirmedAppointment()` invece
 * dell'insert diretto su calendar_events — così l'evento compare anche in
 * Appuntamenti → Confermati (createConfirmedAppointment fa l'insert doppio
 * calendar_event + appointment collegato, con rollback best-effort).
 * "personale" resta `createCalendarEvent()` diretto, invariato. "speciale"
 * non è più una categoria selezionabile qui (piano "Speciale sparisce dal
 * creatore/modificatore eventi"): quegli eventi sono generati solo in
 * automatico dal Profilo (compleanno/anniversario/mesiversario). In
 * modifica, se si apre un evento "speciale" auto-generato la categoria
 * mostrata/salvabile è "Personale" (stesso rimappaggio già esistente per
 * "ciclo", vedi useState di `category` sopra).
 *
 * Scelta di scope esplicita (vedi piano): in modifica, il salvataggio
 * aggiorna SEMPRE E SOLO calendar_events, qualunque sia la categoria scelta
 * — mai crea/rimuove retroattivamente il collegamento Appuntamenti. Se un
 * evento diventa "coppia" via modifica, non comparirà in Appuntamenti finché
 * non viene ricreato da zero (comportamento accettato, hint mostrato
 * all'utente quando la categoria selezionata in edit è "coppia").
 */
export default function EventFormModal({
  coupleId,
  createdBy,
  defaultDate,
  mode = "create",
  initial,
  onClose,
  onSaved,
}: EventFormModalProps) {
  const isEdit = mode === "edit" && !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<EventCategory>(
    initial?.category === "ciclo" || initial?.category === "speciale"
      ? "personale"
      : (initial?.category ?? "personale"),
  );
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [date, setDate] = useState(toDateKey(initial ? new Date(initial.starts_at) : defaultDate));
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [startTime, setStartTime] = useState(initial ? toTimeInputValue(initial.starts_at) : "09:00");
  const [endTime, setEndTime] = useState(
    initial?.ends_at ? toTimeInputValue(initial.ends_at) : initial ? "" : "10:00",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showCoupleFields = !isEdit && category === "coppia";
  const showEditCoupleHint = isEdit && category === "coppia";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    const startsAt = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
    const endsAt = allDay ? null : endTime ? `${date}T${endTime}:00` : null;
    const startsAtIso = new Date(startsAt).toISOString();
    const endsAtIso = endsAt ? new Date(endsAt).toISOString() : null;

    if (isEdit && initial) {
      const result = await updateCalendarEvent(initial.id, {
        title: title.trim(),
        category,
        tag: tag.trim() ? tag.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        allDay,
      });
      setSaving(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved(category);
      return;
    }

    if (category === "coppia") {
      const costValue = cost.trim() ? Number(cost) : undefined;
      const result = await createConfirmedAppointment(
        {
          title: title.trim(),
          location: location.trim() || undefined,
          cost: costValue,
          notes: notes.trim() || undefined,
          tag: tag.trim() || undefined,
        },
        {
          startsAt: startsAtIso,
          endsAt: endsAtIso ?? undefined,
          allDay,
          category: "coppia",
          tag: tag.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      );
      setSaving(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved(category);
      return;
    }

    const result = await createCalendarEvent({
      coupleId,
      createdBy,
      title: title.trim(),
      category,
      tag: tag.trim() ? tag.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      allDay,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved(category);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <h2 className="mb-4 text-lg font-extrabold text-ink">{isEdit ? "Modifica evento" : "Nuovo evento"}</h2>

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
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">Categoria</p>
            <div className="flex gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl border px-2 py-2 text-xs font-semibold transition ${
                    category === opt.value ? "border-transparent text-white" : "border-border text-ink-soft"
                  }`}
                  style={category === opt.value ? { backgroundColor: opt.colorVar } : undefined}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: opt.colorVar, opacity: category === opt.value ? 1 : 0.8 }}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
            {showEditCoupleHint && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-couple-soft/50 px-3 py-2">
                <p className="text-xs text-ink-soft">Luogo e costo si modificano da Appuntamenti.</p>
                <Link
                  href="/appuntamenti"
                  className="shrink-0 rounded-full bg-couple px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95"
                >
                  Vai →
                </Link>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">Tag (opzionale)</p>
            <Input type="text" placeholder="es. amici, sport…" value={tag} onChange={(e) => setTag(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TAG_SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(t)}
                  className="rounded-full bg-partner-a-soft/50 px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-partner-a-soft"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--color-couple)]"
            />
            Tutto il giorno
          </label>

          {!allDay && (
            <div className="flex gap-3">
              <label className="flex-1 text-xs font-semibold text-ink-soft">
                Inizio
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1" />
              </label>
              <label className="flex-1 text-xs font-semibold text-ink-soft">
                Fine
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1" />
              </label>
            </div>
          )}

          {showCoupleFields && (
            <>
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
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "Salvo…" : isEdit ? "Salva modifiche" : "Crea evento"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
