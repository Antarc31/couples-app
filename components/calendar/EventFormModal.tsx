"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { addDays, formatRecurrenceSummary, overlapsAnyEvent, pluralizeRecurrenceUnit, toDateKey, toTimeString } from "@/lib/calendar-dates";
import { createCalendarEvent, listCoupleEventsInRange, updateCalendarEvent } from "@/lib/calendar-actions";
import { createConfirmedAppointment } from "@/lib/appointments-actions";
import type { CalendarEventRow } from "@/lib/calendar-colors";
import type { EventCategory, EventRecurrence } from "@/types/database";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SlotSuggestions from "@/components/calendar/SlotSuggestions";

const CATEGORY_OPTIONS: { value: EventCategory; label: string; colorVar: string }[] = [
  { value: "personale", label: "Personale", colorVar: "var(--color-partner-a)" },
  { value: "coppia", label: "Di coppia", colorVar: "var(--color-couple)" },
];

const TAG_SUGGESTIONS = ["amici", "uni", "sport", "lavoro", "famiglia", "viaggio"];

const RECURRENCE_OPTIONS: { value: EventRecurrence; label: string }[] = [
  { value: "nessuna", label: "Non si ripete" },
  { value: "giornaliera", label: "Ogni giorno" },
  { value: "settimanale", label: "Ogni settimana" },
  { value: "mensile", label: "Ogni mese" },
  { value: "annuale", label: "Ogni anno" },
];

type RecurrenceEndMode = "mai" | "data" | "volte";

/** ISO → HH:mm locale, per popolare gli <input type="time"> in edit. */
function toTimeInputValue(iso: string): string {
  return toTimeString(new Date(iso));
}

/**
 * Costruisce inizio/fine da data+orari del form. Il form ha un solo campo
 * data per entrambi: se l'orario di fine è <= quello di inizio (es. 20:00 ->
 * 00:00, o 22:00 -> 02:00), l'evento attraversa la mezzanotte e la fine va
 * spostata al giorno dopo — altrimenti risulterebbe precedente all'inizio e
 * violerebbe il constraint DB `calendar_events_ends_after_starts` (bug
 * segnalato dall'utente: "20:00 -> 00:00" falliva con l'errore Postgres
 * grezzo mostrato a schermo). Usata sia per il controllo automatico di
 * sovrapposizione sia per il submit, un solo posto per la stessa logica.
 */
function resolveEventRange(
  date: string,
  startTime: string,
  endTime: string,
  allDay: boolean,
): { start: Date; end: Date | null } {
  if (allDay) return { start: new Date(`${date}T00:00:00`), end: null };
  const start = new Date(`${date}T${startTime}:00`);
  if (!endTime) return { start, end: null };
  let end = new Date(`${date}T${endTime}:00`);
  if (end <= start) end = addDays(end, 1);
  return { start, end };
}

interface EventFormModalProps {
  coupleId: string;
  createdBy: string;
  defaultDate: Date;
  /** Default "create". "edit" precompila i campi da `initial` e chiama updateCalendarEvent. */
  mode?: "create" | "edit";
  /** Obbligatorio quando mode === "edit". */
  initial?: CalendarEventRow;
  /** Solo mode === "create": precompila inizio/fine da uno slot scelto con "Trova buchi liberi" (CalendarView), invece dei default fissi 09:00–10:00. */
  initialTimeRange?: { startTime: string; endTime: string };
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
  initialTimeRange,
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
  const [startTime, setStartTime] = useState(
    initial ? toTimeInputValue(initial.starts_at) : (initialTimeRange?.startTime ?? "09:00"),
  );
  const [endTime, setEndTime] = useState(
    initial?.ends_at ? toTimeInputValue(initial.ends_at) : initial ? "" : (initialTimeRange?.endTime ?? "10:00"),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rilevamento sovrapposizione automatico (nessun checkbox): non blocca il
  // salvataggio, solo un avviso + suggerimento — vedi piano "buchi comuni".
  const [overlapWarning, setOverlapWarning] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Ricorrenza generale (piano "ricorrenza generale"): mai/dopo-N-volte/
  // fino-a-una-data sono mutuamente esclusivi lato UI (recurrenceEndMode),
  // solo il campo del modo selezionato viene inviato (l'altro resta null).
  const [recurrence, setRecurrence] = useState<EventRecurrence>(initial?.recurrence ?? "nessuna");
  // Stringa grezza (stesso pattern di `cost` sopra), non un numero
  // coercizzato a ogni tasto: forzare subito "" -> 1 nell'onChange impedisce
  // di svuotare il campo per riscriverlo (es. cancellare "1" per scrivere
  // "12" ridiventava "1" a metà digitazione). Parsata/clampata solo dove
  // serve il valore numerico (submit, anteprima, etichetta unità).
  const [recurrenceInterval, setRecurrenceInterval] = useState(String(initial?.recurrence_interval ?? 1));
  const recurrenceIntervalNum = Math.max(1, parseInt(recurrenceInterval, 10) || 1);
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<RecurrenceEndMode>(
    initial?.recurrence_until ? "data" : initial?.recurrence_count ? "volte" : "mai",
  );
  const [recurrenceUntilDate, setRecurrenceUntilDate] = useState(
    initial?.recurrence_until ? toDateKey(new Date(initial.recurrence_until)) : "",
  );
  const [recurrenceCount, setRecurrenceCount] = useState(String(initial?.recurrence_count ?? 1));
  const recurrenceCountNum = Math.min(10, Math.max(1, parseInt(recurrenceCount, 10) || 1));

  const showCoupleFields = !isEdit && category === "coppia";
  const showEditCoupleHint = isEdit && category === "coppia";

  const recurrenceUnitLabel =
    recurrence === "nessuna" ? "" : pluralizeRecurrenceUnit(recurrence, recurrenceIntervalNum);
  const recurrenceSummary =
    recurrence === "nessuna"
      ? null
      : formatRecurrenceSummary(
          recurrence,
          recurrenceIntervalNum,
          recurrenceEndMode === "data" && recurrenceUntilDate ? recurrenceUntilDate : null,
          recurrenceEndMode === "volte" ? recurrenceCountNum : null,
        );

  useEffect(() => {
    if (allDay || !startTime || !endTime) {
      setOverlapWarning(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { start, end } = resolveEventRange(date, startTime, endTime, false);
      if (!end) return;
      const dayStart = new Date(`${date}T00:00:00`);
      // Copre anche il giorno dopo se l'evento attraversa la mezzanotte
      // (vedi resolveEventRange), altrimenti un evento 20:00->00:00 non
      // verrebbe mai confrontato con impegni della primissima mattina dopo.
      const dayEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
      const result = await listCoupleEventsInRange(coupleId, dayStart, dayEnd);
      if (cancelled || "error" in result) return;
      const events = initial ? result.filter((ev) => ev.id !== initial.id) : result;
      setOverlapWarning(overlapsAnyEvent(events, start, end));
    })();
    return () => {
      cancelled = true;
    };
  }, [coupleId, date, startTime, endTime, allDay, initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    const { start, end } = resolveEventRange(date, startTime, endTime, allDay);
    const startsAtIso = start.toISOString();
    const endsAtIso = end ? end.toISOString() : null;

    // "Fino al" memorizzato a fine giornata (23:59:59): garantisce che
    // l'occorrenza dell'ultimo giorno scelto (qualunque sia l'orario di
    // starts_at) rientri comunque, e che recurrence_until >= starts_at non
    // scatti mai per errore se si sceglie proprio il giorno di inizio.
    const recurrencePayload =
      recurrence === "nessuna"
        ? { recurrence: "nessuna" as const, recurrenceInterval: 1, recurrenceUntil: null, recurrenceCount: null }
        : {
            recurrence,
            recurrenceInterval: recurrenceIntervalNum,
            recurrenceUntil:
              recurrenceEndMode === "data" && recurrenceUntilDate
                ? new Date(`${recurrenceUntilDate}T23:59:59`).toISOString()
                : null,
            recurrenceCount: recurrenceEndMode === "volte" ? recurrenceCountNum : null,
          };

    if (isEdit && initial) {
      const result = await updateCalendarEvent(initial.id, {
        title: title.trim(),
        category,
        tag: tag.trim() ? tag.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        allDay,
        ...recurrencePayload,
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
          ...recurrencePayload,
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
      ...recurrencePayload,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved(category);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface on-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
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

          {overlapWarning && !allDay && (
            <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-3">
              <p className="text-xs font-semibold text-danger">⚠️ Si sovrappone a un impegno già in calendario</p>
              {!showSuggestions ? (
                <button
                  type="button"
                  onClick={() => setShowSuggestions(true)}
                  className="self-start rounded-full bg-surface on-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm transition active:scale-95"
                >
                  Suggerisci slot orario
                </button>
              ) : (
                <SlotSuggestions
                  coupleId={coupleId}
                  from={new Date(`${date}T00:00:00`)}
                  daysAhead={7}
                  excludeEventId={initial?.id}
                  onPick={(start, end) => {
                    setDate(toDateKey(start));
                    setStartTime(toTimeString(start));
                    setEndTime(toTimeString(end));
                    setShowSuggestions(false);
                  }}
                />
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">Ripeti</p>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as EventRecurrence)}
              aria-label="Ripeti"
              className="w-full rounded-2xl border border-border bg-surface on-surface px-4 py-3 text-[15px] text-ink outline-none focus:border-partner-a focus:ring-2 focus:ring-partner-a-soft"
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {recurrence !== "nessuna" && (
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm text-ink">
                  Ogni
                  <Input
                    type="number"
                    aria-label="Ogni quante unità"
                    min={1}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(e.target.value)}
                    onBlur={() => setRecurrenceInterval(String(recurrenceIntervalNum))}
                    className="w-16"
                  />
                  {recurrenceUnitLabel}
                </label>

                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-ink-soft">Fine</p>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name="recurrence-end"
                      checked={recurrenceEndMode === "mai"}
                      onChange={() => setRecurrenceEndMode("mai")}
                      className="h-4 w-4 accent-[var(--color-couple)]"
                    />
                    Mai
                  </label>
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="recurrence-end"
                        checked={recurrenceEndMode === "data"}
                        onChange={() => setRecurrenceEndMode("data")}
                        className="h-4 w-4 accent-[var(--color-couple)]"
                      />
                      Fino al
                    </label>
                    <Input
                      type="date"
                      aria-label="Data di fine ricorrenza"
                      min={date}
                      value={recurrenceUntilDate}
                      onChange={(e) => setRecurrenceUntilDate(e.target.value)}
                      disabled={recurrenceEndMode !== "data"}
                      required={recurrenceEndMode === "data"}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="recurrence-end"
                        checked={recurrenceEndMode === "volte"}
                        onChange={() => setRecurrenceEndMode("volte")}
                        className="h-4 w-4 accent-[var(--color-couple)]"
                      />
                      Dopo
                    </label>
                    <Input
                      type="number"
                      aria-label="Numero di volte"
                      min={1}
                      max={10}
                      value={recurrenceCount}
                      onChange={(e) => setRecurrenceCount(e.target.value)}
                      onBlur={() => setRecurrenceCount(String(recurrenceCountNum))}
                      disabled={recurrenceEndMode !== "volte"}
                      className="w-16"
                    />
                    volte
                  </div>
                </div>

                {recurrenceSummary && <p className="text-xs text-ink-soft">🔁 {recurrenceSummary}</p>}
              </div>
            )}
          </div>

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
            className="w-full resize-none rounded-2xl border border-border bg-surface on-surface px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft outline-none focus:border-partner-a focus:ring-2 focus:ring-partner-a-soft"
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
