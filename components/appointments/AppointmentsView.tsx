"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysBetween } from "@/lib/calendar-dates";
import { listAppointments, type Appointment } from "@/lib/appointments-actions";
import Card from "@/components/ui/Card";
import AppointmentFormModal, { type AppointmentFormMode } from "@/components/appointments/AppointmentFormModal";
import AppointmentDetailSheet from "@/components/appointments/AppointmentDetailSheet";

export interface LinkedEvent {
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
}

function countdownLabel(iso: string): string {
  const days = daysBetween(new Date(), new Date(iso));
  if (days < 0) return "già passato";
  if (days === 0) return "oggi";
  if (days === 1) return "domani";
  return `tra ${days} giorni`;
}

function formatEventDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  if (allDay) return datePart;
  const timePart = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

function formatCost(cost: number | null): string | null {
  if (cost == null) return null;
  return Number.isInteger(cost) ? `~${cost}€` : `~${cost.toFixed(2)}€`;
}

function tagEmoji(tag: string | null): string {
  if (!tag) return "📍";
  const t = tag.toLowerCase();
  if (t.includes("viagg")) return "✈️";
  if (t.includes("ristor")) return "🍽️";
  if (t.includes("attiv")) return "🎯";
  return "📍";
}

/**
 * Schermata Appuntamenti (docs/PLAN.md sezione "Appuntamenti"): segmented
 * control Confermati/Idee, grid Pinterest per le idee, FAB "+" con scelta
 * idea/confermato. Dati reali (tabella `appointments`, live dal 2026-09-01,
 * confermato da main) via lib/appointments-actions.ts.
 *
 * `appointments` non duplica data/ora: quelle vivono sul `calendar_event`
 * collegato (calendar_event_id), quindi per i confermati carichiamo anche
 * le righe `calendar_events` corrispondenti in un secondo giro (in-clause su
 * calendar_event_id), stesso client browser di CalendarView.tsx.
 */
export default function AppointmentsView() {
  const [tab, setTab] = useState<Appointment["status"]>("confermato");
  const [items, setItems] = useState<Appointment[]>([]);
  const [eventsById, setEventsById] = useState<Record<string, LinkedEvent>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<{
    mode: AppointmentFormMode;
    initial?: Appointment;
    initialEvent?: LinkedEvent;
  } | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listAppointments();
    if ("error" in result) {
      setLoading(false);
      setError(result.error);
      return;
    }
    setItems(result);

    const eventIds = result.map((a) => a.calendarEventId).filter((id): id is string => id !== null);
    if (eventIds.length > 0) {
      const supabase = createClient();
      const { data: events } = await supabase
        .from("calendar_events")
        .select("id, starts_at, ends_at, all_day")
        .in("id", eventIds);
      const map: Record<string, LinkedEvent> = {};
      for (const ev of events ?? []) {
        map[ev.id] = { startsAt: ev.starts_at, endsAt: ev.ends_at, allDay: ev.all_day };
      }
      setEventsById(map);
    } else {
      setEventsById({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmed = items
    .filter((a) => a.status === "confermato")
    .map((a) => ({ appointment: a, event: a.calendarEventId ? eventsById[a.calendarEventId] : undefined }))
    .sort((a, b) => (a.event?.startsAt ?? "").localeCompare(b.event?.startsAt ?? ""));
  const ideas = items.filter((a) => a.status === "idea");

  function handleSaved() {
    setFormState(null);
    load();
  }

  function handleEdit(appointment: Appointment) {
    setFormState({
      mode: "edit",
      initial: appointment,
      initialEvent: appointment.calendarEventId ? eventsById[appointment.calendarEventId] : undefined,
    });
    setSelectedAppointment(null);
  }

  function handleDeleted() {
    setSelectedAppointment(null);
    load();
  }

  return (
    <div className="theme-calendar bg-diary flex flex-1 flex-col gap-4 px-4 pt-5">
      <div className="flex w-full rounded-2xl bg-partner-a-soft/50 p-1">
        {(["confermato", "idea"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
              tab === v ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
            }`}
          >
            {v === "confermato" ? "Confermati" : "Idee"}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-center text-xs text-ink-soft">Carico appuntamenti…</p>}

      {tab === "confermato" ? (
        confirmed.length === 0 && !loading ? (
          <EmptyState emoji="📍" text="Nessun appuntamento confermato. Trasforma un'idea o aggiungine uno nuovo!" />
        ) : (
          <div className="flex flex-col gap-3">
            {confirmed.map(({ appointment: a, event }) => (
              <Card
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedAppointment(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedAppointment(a);
                }}
                className="flex cursor-pointer gap-3"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-couple-soft text-2xl">
                  {tagEmoji(a.tag)}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-ink">{a.title}</p>
                  <p className="text-xs text-ink-soft">
                    {event ? formatEventDate(event.startsAt, event.allDay) : "senza data"}
                    {a.location ? ` · ${a.location}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {formatCost(a.cost) && (
                      <span className="rounded-full bg-base px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                        {formatCost(a.cost)}
                      </span>
                    )}
                    {event && (
                      <span className="rounded-full bg-couple-soft px-2 py-0.5 text-[11px] font-semibold text-couple">
                        {countdownLabel(event.startsAt)}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : ideas.length === 0 && !loading ? (
        <EmptyState emoji="💡" text="Ancora nessuna idea. Aggiungine una con il pulsante +!" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {ideas.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedAppointment(a)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelectedAppointment(a);
              }}
              className="flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-app)] bg-surface shadow-[var(--shadow-soft)]"
            >
              <div className="flex h-28 items-center justify-center bg-partner-a-soft/50 text-4xl">{tagEmoji(a.tag)}</div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="text-sm font-bold text-ink">{a.title}</p>
                {a.tag && (
                  <span className="w-fit rounded-full bg-partner-a-soft/50 px-2 py-0.5 text-[11px] font-semibold capitalize text-ink-soft">
                    {a.tag}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    // Non deve far scattare ANCHE l'apertura del detail sheet dell'idea
                    // (l'onClick del contenitore, sopra) — stessa classe di problema già
                    // risolta per il cuore in MemoriesDeck.tsx, qui però basta stopPropagation
                    // su un click, non c'è nessun gesture di drag da proteggere.
                    e.stopPropagation();
                    setFormState({ mode: "transform", initial: a });
                  }}
                  className="mt-auto rounded-xl bg-couple-soft px-2 py-1.5 text-xs font-bold text-couple transition active:scale-[0.98]"
                >
                  Trasforma in appuntamento
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {fabOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setFabOpen(false)} />
          <div className="fixed bottom-36 right-5 z-20 flex flex-col items-end gap-2">
            <button
              onClick={() => {
                setFabOpen(false);
                setFormState({ mode: "idea" });
              }}
              className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-[var(--shadow-soft)] transition active:scale-95"
            >
              💡 Nuova idea
            </button>
            <button
              onClick={() => {
                setFabOpen(false);
                setFormState({ mode: "confirmed" });
              }}
              className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-[var(--shadow-soft)] transition active:scale-95"
            >
              📍 Appuntamento confermato
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => setFabOpen((v) => !v)}
        className="fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-couple text-2xl font-bold text-white shadow-[var(--shadow-soft)] transition active:scale-95"
        aria-label="Aggiungi idea o appuntamento"
      >
        {fabOpen ? "✕" : "+"}
      </button>

      {formState && (
        <AppointmentFormModal
          mode={formState.mode}
          initial={formState.initial}
          initialEvent={formState.initialEvent}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailSheet
          appointment={selectedAppointment}
          event={
            selectedAppointment.calendarEventId ? eventsById[selectedAppointment.calendarEventId] : undefined
          }
          onClose={() => setSelectedAppointment(null)}
          onEdit={() => handleEdit(selectedAppointment)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="text-3xl">{emoji}</span>
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  );
}
