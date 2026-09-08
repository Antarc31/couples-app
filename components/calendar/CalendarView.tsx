"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addDays,
  addMonths,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  isSameDay,
  monthGrid,
  projectOccurrences,
  toDateKey,
  toTimeString,
  weekDays,
  WEEKDAY_LABELS,
} from "@/lib/calendar-dates";
import { eventColor, type CalendarEventRow, type ColorContext } from "@/lib/calendar-colors";
import type { EventCategory } from "@/types/database";
import EventFormModal from "@/components/calendar/EventFormModal";
import DayAgendaSheet from "@/components/calendar/DayAgendaSheet";
import DayTimeline from "@/components/calendar/DayTimeline";
import WeekTimeline from "@/components/calendar/WeekTimeline";
import EventDetailSheet from "@/components/calendar/EventDetailSheet";
import SlotSuggestions from "@/components/calendar/SlotSuggestions";
import Toast from "@/components/ui/Toast";
import { Search } from "@/components/ui/icons";

type View = "day" | "week" | "month";

const VIEW_LABELS: Record<View, string> = { day: "Giorno", week: "Settimana", month: "Mese" };

interface CalendarViewProps {
  selfId: string;
  selfColor: string;
  selfName: string;
  partnerId: string | null;
  partnerColor: string | null;
  partnerName: string;
  coupleId: string;
}

// Piano UX punto 2: barre invece di pallini in vista Mese, max ~4 visibili
// prima di un indicatore "+N" testuale (stesso pattern già in uso).
const MAX_BARS = 4;

export default function CalendarView({
  selfId,
  selfColor,
  selfName,
  partnerId,
  partnerColor,
  partnerName,
  coupleId,
}: CalendarViewProps) {
  const [view, setView] = useState<View>("week");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [agendaDate, setAgendaDate] = useState<Date | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // "Buchi comuni": bottom-sheet indipendente + slot scelto in attesa di
  // precompilare EventFormModal (null quando showCreate non arriva da qui).
  const [showFreeSlots, setShowFreeSlots] = useState(false);
  const [pickedSlot, setPickedSlot] = useState<{ date: Date; startTime: string; endTime: string } | null>(null);
  // Piano UX punto 3: dettaglio evento (Modifica/Elimina) + modifica.
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRow | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRow | null>(null);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "neutral" | "coppia" } | null>(null);

  function showSaveToast(category: EventCategory) {
    setToast(
      category === "coppia"
        ? { message: "Salvato! Ora è sul calendario di entrambi 💞", variant: "coppia" }
        : { message: "Evento salvato", variant: "neutral" },
    );
  }

  const colorCtx: ColorContext = { selfId, selfColor, partnerId, partnerColor };
  const weeks = monthGrid(monthAnchor);
  const monthGridStart = weeks[0][0];
  const monthGridEnd = weeks[weeks.length - 1][6];
  const weekDaysOfSelected = weekDays(selectedDate);

  // Bug fix (piano UX, punto 1): il fetch caricava SOLO il range della
  // griglia mese di `monthAnchor`, non `selectedDate`. Navigando in vista
  // Giorno abbastanza da uscire dal mese caricato (es. avanti/indietro per
  // più di 2-3 settimane), la label del giorno cambiava ma l'agenda poteva
  // mostrare "nessun evento" anche quando in realtà ce ne sono (dato non
  // ancora fetchato). Fix: il range di fetch è l'unione tra la griglia mese
  // corrente e una finestra di ±7 giorni intorno a `selectedDate`, così
  // qualunque giorno effettivamente selezionabile in vista Giorno resta
  // sempre coperto dal fetch, indipendentemente da `monthAnchor`.
  const selectedBufferStart = addDays(selectedDate, -7);
  const selectedBufferEnd = addDays(selectedDate, 7);
  const gridStart = selectedBufferStart < monthGridStart ? selectedBufferStart : monthGridStart;
  const gridEnd = selectedBufferEnd > monthGridEnd ? selectedBufferEnd : monthGridEnd;

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // Bug pre-esistente (piano, punto 3): gli eventi ricorrenti
    // (compleanno/anniversario/mesiversario) sono salvati con la loro data
    // letterale (es. l'anno di nascita) e questa prima query li troverebbe
    // solo se quell'anno letterale cadesse per caso nel range visualizzato.
    // Servono DUE query: questa (range di data su starts_at, per gli eventi
    // non ricorrenti) più una seconda sotto (nessun filtro di data, solo
    // recurrence != 'nessuna') le cui occorrenze vengono proiettate a
    // runtime nel range corrente con projectOccurrences — stesso meccanismo
    // già usato dal countdown Home (nextOccurrence), mai implementato prima
    // lato vista Calendario. Le due query girano in parallelo.
    const [dateRangeResult, recurringResult] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("*")
        .eq("couple_id", coupleId)
        .gte("starts_at", gridStart.toISOString())
        .lt("starts_at", addDays(gridEnd, 1).toISOString())
        .order("starts_at", { ascending: true }),
      // Insieme piccolo per natura (al massimo ~4 per coppia: 2 compleanni,
      // anniversario, mesiversario) — nessun filtro di data qui, deliberato.
      supabase.from("calendar_events").select("*").eq("couple_id", coupleId).neq("recurrence", "nessuna"),
    ]);

    setLoading(false);
    if (dateRangeResult.error) {
      setError(dateRangeResult.error.message);
      return;
    }
    if (recurringResult.error) {
      setError(recurringResult.error.message);
      return;
    }

    const recurringEvents = recurringResult.data ?? [];
    const recurringIds = new Set(recurringEvents.map((ev) => ev.id));

    // Gli eventi ricorrenti vengono SEMPRE dalla proiezione sotto (mai dalla
    // prima query), anche quando la loro data letterale cade già nel range
    // corrente — un'unica fonte di verità, per non rischiare un doppione
    // nello stesso giorno (occorrenza letterale + occorrenza proiettata).
    const nonRecurring = (dateRangeResult.data ?? []).filter((ev) => !recurringIds.has(ev.id));

    const projected: CalendarEventRow[] = [];
    for (const ev of recurringEvents) {
      const occurrences = projectOccurrences(
        ev.starts_at,
        ev.recurrence,
        gridStart,
        gridEnd,
        ev.recurrence_interval,
        ev.recurrence_until,
        ev.recurrence_count,
      );
      for (const occurrence of occurrences) {
        // Copia di visualizzazione: stesso id/title/category della riga
        // reale, solo starts_at sovrascritto con la data proiettata. Il tap
        // apre comunque EventDetailSheet/EventFormModal sulla riga REALE
        // (stesso id) — modificarla sposta l'ancora starts_at del template,
        // comportamento accettabile e previsto (vedi piano).
        projected.push({ ...ev, starts_at: occurrence.toISOString() });
      }
    }

    setEvents([...nonRecurring, ...projected].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId, toDateKey(gridStart), toDateKey(gridEnd)]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  function eventsOnDay(day: Date) {
    return events.filter((ev) => isSameDay(new Date(ev.starts_at), day));
  }

  const createDefaultDate = pickedSlot?.date ?? agendaDate ?? selectedDate;

  return (
    <div className="theme-calendar bg-diary flex flex-1 flex-col gap-4 px-4 pt-5">
      <div className="flex w-full rounded-2xl bg-couple-soft/50 p-1">
        {(["day", "week", "month"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
              view === v ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
            }`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-ink-soft">
        <LegendDot color={selfColor} label={selfName} />
        {partnerId && <LegendDot color={partnerColor ?? "var(--color-partner-b)"} label={partnerName} />}
        <LegendDot color="var(--color-couple)" label="Di coppia" />
        <LegendDot color="var(--color-special)" label="Speciale" />
      </div>

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {view === "month" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink shadow-sm transition active:scale-95"
              aria-label="Mese precedente"
            >
              ‹
            </button>
            <p className="flex-1 text-center text-sm font-bold capitalize text-ink">{formatMonthLabel(monthAnchor)}</p>
            <button
              onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink shadow-sm transition active:scale-95"
              aria-label="Mese successivo"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-ink-soft">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="capitalize">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((day) => {
              const inMonth = day.getMonth() === monthAnchor.getMonth();
              const dayEvents = eventsOnDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={toDateKey(day)}
                  onClick={() => setAgendaDate(day)}
                  className={`flex aspect-square flex-col items-center justify-start gap-1 rounded-2xl pt-1.5 text-xs transition ${
                    inMonth ? "text-ink" : "text-ink-soft/40"
                  } ${isToday ? "bg-couple-soft font-bold" : "hover:bg-couple-soft/30"}`}
                >
                  <span>{day.getDate()}</span>
                  {/* Piano UX punto 2: barre (chi ha impegni, non solo "quanti") invece
                      di pallini, stessa logica colore di eventColor()/Day view — nessuna
                      nuova funzione colore, cambia solo la forma. */}
                  <span className="flex w-full flex-col gap-[2px] px-1.5">
                    {dayEvents.slice(0, MAX_BARS).map((ev) => (
                      <span
                        key={ev.id}
                        className="h-[3px] w-full rounded-full"
                        style={{ backgroundColor: eventColor(ev, colorCtx) }}
                      />
                    ))}
                    {dayEvents.length > MAX_BARS && (
                      <span className="text-[9px] leading-none text-ink-soft">+{dayEvents.length - MAX_BARS}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {loading && <p className="text-center text-xs text-ink-soft">Carico eventi…</p>}
        </div>
      ) : view === "week" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedDate((d) => addDays(d, -7))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink shadow-sm transition active:scale-95"
              aria-label="Settimana precedente"
            >
              ‹
            </button>
            <p className="flex-1 text-center text-sm font-bold capitalize text-ink">
              {formatWeekRangeLabel(weekDaysOfSelected[0], weekDaysOfSelected[6])}
            </p>
            <button
              onClick={() => setSelectedDate((d) => addDays(d, 7))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink shadow-sm transition active:scale-95"
              aria-label="Settimana successiva"
            >
              ›
            </button>
          </div>

          <WeekTimeline
            days={weekDaysOfSelected}
            events={events}
            colorCtx={colorCtx}
            onEventClick={setSelectedEvent}
            onDayClick={setAgendaDate}
          />
          {loading && <p className="text-center text-xs text-ink-soft">Carico eventi…</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedDate((d) => addDays(d, -1))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink shadow-sm transition active:scale-95"
              aria-label="Giorno precedente"
            >
              ‹
            </button>
            <p className="flex-1 text-center text-sm font-bold capitalize text-ink">{formatDayLabel(selectedDate)}</p>
            <button
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink shadow-sm transition active:scale-95"
              aria-label="Giorno successivo"
            >
              ›
            </button>
          </div>

          <DayTimeline
            day={selectedDate}
            events={eventsOnDay(selectedDate)}
            colorCtx={colorCtx}
            onEventClick={setSelectedEvent}
          />
          {loading && <p className="text-center text-xs text-ink-soft">Carico eventi…</p>}
        </div>
      )}

      {/* Stessa riga del FAB "+", ancorato in basso (non più una pillola
          isolata in cima alla pagina): stesso accento dell'app (couple), un
          filo più tenue per restare un'azione secondaria rispetto a "nuovo
          evento". items-center sull'intera riga allinea i centri verticali
          dei due bottoni anche se hanno altezze diverse (pillola vs cerchio
          56px). */}
      <div className="fixed inset-x-5 bottom-20 z-20 flex items-center justify-between">
        <button
          onClick={() => setShowFreeSlots(true)}
          className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold text-couple shadow-[var(--shadow-soft)] transition active:scale-95"
        >
          <Search size={16} strokeWidth={2.2} />
          Trova buchi liberi
        </button>

        <button
          onClick={() => {
            setPickedSlot(null);
            setShowCreate(true);
          }}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-couple text-2xl font-bold text-white shadow-[var(--shadow-soft)] transition active:scale-95"
          aria-label="Nuovo evento"
        >
          +
        </button>
      </div>

      {agendaDate && (
        <DayAgendaSheet
          date={agendaDate}
          events={eventsOnDay(agendaDate)}
          colorCtx={colorCtx}
          onClose={() => setAgendaDate(null)}
          onAddEvent={() => {
            setPickedSlot(null);
            setShowCreate(true);
          }}
          onEventClick={setSelectedEvent}
        />
      )}

      {showFreeSlots && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-scrim/30 backdrop-blur-sm sm:items-center"
          onClick={() => setShowFreeSlots(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-ink">Trova buchi liberi</h2>
              <button onClick={() => setShowFreeSlots(false)} className="text-sm text-ink-soft" aria-label="Chiudi">
                ✕
              </button>
            </div>
            <SlotSuggestions
              coupleId={coupleId}
              from={new Date()}
              daysAhead={14}
              onPick={(start, end) => {
                setShowFreeSlots(false);
                setPickedSlot({ date: start, startTime: toTimeString(start), endTime: toTimeString(end) });
                setShowCreate(true);
              }}
            />
          </div>
        </div>
      )}

      {showCreate && (
        <EventFormModal
          coupleId={coupleId}
          createdBy={selfId}
          defaultDate={createDefaultDate}
          initialTimeRange={pickedSlot ? { startTime: pickedSlot.startTime, endTime: pickedSlot.endTime } : undefined}
          onClose={() => {
            setShowCreate(false);
            setPickedSlot(null);
          }}
          onSaved={(category) => {
            setShowCreate(false);
            setPickedSlot(null);
            setAgendaDate(null);
            loadEvents();
            showSaveToast(category);
          }}
        />
      )}

      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          selfId={selfId}
          colorCtx={colorCtx}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => {
            setEditingEvent(selectedEvent);
            setSelectedEvent(null);
          }}
          onDeleted={() => {
            setSelectedEvent(null);
            loadEvents();
          }}
        />
      )}

      {editingEvent && (
        <EventFormModal
          coupleId={coupleId}
          createdBy={selfId}
          defaultDate={new Date(editingEvent.starts_at)}
          mode="edit"
          initial={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={(category) => {
            setEditingEvent(null);
            loadEvents();
            showSaveToast(category);
          }}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

