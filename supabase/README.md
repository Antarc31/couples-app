# Supabase — couples-app

Backend Supabase per la Fase 1 (MVP). Questo documento copre: come avviare
l'ambiente locale, cosa contiene lo schema, come funziona il pairing, e il
pattern di subscription Realtime che il frontend deve usare.

> Fonte di verità per il modello dati: `docs/PLAN.md` → "Architettura tecnica
> (raccomandazione)". Non cambiare lo schema senza aggiornare quel documento.

## Stato di questo ambiente (importante)

In questo sandbox di sviluppo **non è disponibile Docker** (`docker: command
not found`, verificato con `supabase start`) e non esiste ancora un progetto
Supabase cloud creato dall'utente. Di conseguenza:

- **Fatto ed eseguito**: `supabase init` (ha generato `supabase/config.toml` e
  `supabase/.gitignore`), scrittura delle migration SQL, type-check TypeScript
  di `lib/supabase/*.ts` e `types/database.ts` (`npx tsc --noEmit` pulito).
- **NON eseguito/verificato in questo ambiente** (richiede Docker o un
  progetto cloud): `supabase start`, applicazione effettiva delle migration
  su un Postgres reale, `supabase gen types typescript` da un DB vivo, test
  end-to-end delle RLS policy e delle funzioni RPC.
- Le migration SQL sono state scritte e revisionate a mano con la massima
  cura (sintassi PL/pgSQL, ordine di creazione tabelle/FK, RLS), ma **vanno
  comunque validate con un `supabase start` reale (Docker) o su un progetto
  cloud prima di considerarle definitive** — chiedo al QA/lead di eseguire
  questo passaggio appena Docker è disponibile.

## Setup ambiente locale (quando Docker è disponibile)

Prerequisiti sulla macchina di chi esegue questi comandi:

1. **Docker Desktop** (o Podman) installato e in esecuzione.
2. Supabase CLI — non serve installarla globalmente, usare `npx supabase ...`
   (il progetto non ha `supabase` come dipendenza npm perché la CLI non è una
   libreria di runtime; se preferito: `brew install supabase/tap/supabase`).

Comandi, dalla root del progetto:

```bash
# Avvia Postgres + Auth + Realtime + Storage + Studio in container locali.
# Applica automaticamente tutte le migration in supabase/migrations/.
npx supabase start

# Stampa URL/anon key/service role key locali (servono per .env.local, vedi sotto).
npx supabase status

# Ferma i container (i dati restano nei volumi Docker finché non si fa `db reset`).
npx supabase stop
```

Dopo `supabase start`, creare (o aggiornare) `.env.local` nella root del
progetto con i valori restituiti da `supabase status`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key da `supabase status`>
```

`.env.local` non va committato (già coperto da `.gitignore` standard di
Next.js). La `service_role` key (bypassa RLS) NON va mai esposta al
frontend/browser: serve solo per script server-side interni, se e quando
necessaria in futuro.

### Rigenerare le migration da zero / applicare nuove migration

```bash
# Ricrea il DB locale da zero e rigioca tutte le migration in ordine + seed.sql (se presente).
npx supabase db reset

# Dopo aver aggiunto una nuova migration a mano in supabase/migrations/,
# per applicarla senza perdere i dati esistenti nel DB locale:
npx supabase migration up
```

### Rigenerare types/database.ts da un DB reale

`types/database.ts` in questo momento è scritto a mano (vedi commento in
testa al file) perché non è stato possibile eseguire la CLI contro un DB
vero in questo ambiente. Quando Docker (o un progetto cloud) è disponibile:

```bash
# Da DB locale (dopo `supabase start`):
npx supabase gen types typescript --local > types/database.ts

# Da progetto cloud collegato:
npx supabase link --project-ref <ref>
npx supabase gen types typescript --project-id <ref> > types/database.ts
```

La forma del file (interfaccia `Database` con `Tables`/`Enums`/`Functions`)
è la stessa: `lib/supabase/*.ts` non richiede modifiche dopo la rigenerazione.

## Struttura

```
supabase/
  config.toml          # config CLI (porte, versione Postgres, ecc.)
  migrations/          # SQL versionato, applicato in ordine di nome file
  functions/            # Edge Functions (nessuna per ora in fase 1: pairing
                         # è implementato come funzioni RPC Postgres, più
                         # semplice da gestire con RLS/transazioni per questo
                         # caso d'uso — vedi sotto)
```

## Schema (fase 1)

Vedi i commenti SQL in ogni file di migration per il dettaglio completo.
Riepilogo:

| Tabella | Scopo | Scrittura da client |
|---|---|---|
| `profiles` | Estende `auth.users`: nome, avatar, colore calendario, `couple_id` | Solo `UPDATE` di propri dati (`display_name`, `avatar_url`, `color`); riga creata automaticamente al signup da un trigger |
| `couples` | Una riga per coppia accoppiata, con `relationship_start_date` | Nessuna scrittura diretta — solo via RPC `accept_pairing_invite` |
| `pairing_invites` | Codici invito (stato, scadenza) | Nessuna scrittura diretta — solo via RPC `create_pairing_invite` / `accept_pairing_invite` |
| `calendar_events` | Eventi calendario condiviso (categoria, tag libero, ricorrenza annuale, privacy ciclo) | `INSERT`/`UPDATE`/`DELETE` propri; eventi categoria `coppia` modificabili/eliminabili da entrambi i partner |

Enum:
- `event_category`: `personale` | `coppia` | `speciale` | `ciclo`
- `event_recurrence`: `nessuna` | `annuale`

### Privacy RLS — punti da conoscere

- **Ciclo**: un evento `calendar_events` con `category = 'ciclo'` è visibile
  al partner solo se `is_shared_with_partner = true`. Default `false`.
  Applicato lato server con Row Level Security, non solo nascosto in UI.
- **Eventi personali sono comunque visibili al partner** (con il colore del
  creatore) — è così che il calendario condiviso permette di vedere gli
  impegni di entrambi e calcolare i "buchi comuni" in una fase successiva.
  Solo il ciclo ha privacy opt-in, non gli eventi "personale" in generale.
- Nessun utente può leggere/scrivere righe di una coppia diversa dalla
  propria: ogni policy filtra per `couple_id = current_couple_id()`, dove
  `current_couple_id()` è una funzione helper che ritorna il `couple_id` del
  profilo dell'utente autenticato.

## Pairing (funzioni RPC)

Implementato come **funzioni RPC Postgres** (`SECURITY DEFINER`), non come
Edge Function: la logica (generare codice, validare, creare `couples`,
aggiornare due `profiles`, invalidare l'invito) è tutta transazionale e
relazionale — un'unica chiamata SQL atomica è più semplice e robusta di una
Edge Function che dovrebbe comunque fare le stesse query, e chiamare RPC da
`supabase-js` è altrettanto semplice per il frontend.

```ts
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// Chi invita: genera un codice da condividere (es. mostrato in UI + share).
const { data: code, error } = await supabase.rpc("create_pairing_invite");
// code: string, es. "7K4QXPMN" — 8 caratteri, alfabeto senza 0/O/1/I.
// Errore se l'utente è già accoppiato.

// Chi riceve il codice: lo inserisce per accoppiarsi.
const { data: coupleId, error } = await supabase.rpc("accept_pairing_invite", {
  invite_code: "7K4QXPMN",
});
// coupleId: string (uuid) della riga `couples` appena creata.
// Errore (messaggio leggibile in `error.message`) se: codice inesistente,
// scaduto, già usato, se provi ad accettare il tuo stesso codice, o se uno
// dei due utenti è già accoppiato.
```

Dopo un accoppiamento riuscito, il `couple_id` di entrambi i `profiles` viene
aggiornato: il frontend può rilevare il cambiamento sia rifacendo una query
su `profiles`, sia sottoscrivendosi in Realtime (vedi sezione sotto) alla
propria riga `profiles` o alla propria riga `pairing_invites`.

## Realtime — pattern di subscription per il frontend

Tabelle pubblicate su `supabase_realtime` (fase 1): `calendar_events`,
`couples`, `profiles`, `pairing_invites`. Aggiunte successivamente:
`messages`, `appointments`, `wishlist_items`, `notifications` (vedi le
rispettive migration). Realtime applica la RLS della tabella per utente
connesso: un client riceve solo eventi sulle righe che potrebbe leggere via
`SELECT` (es. eventi "ciclo" non condivisi non arrivano al partner, inviti
pairing di altri utenti non arrivano a te, notifiche non arrivano a chi non
ne è il destinatario).

Pattern generale con `supabase-js` v2 (usare il client browser, non quello
server, per le subscription — vivono lato client):

```ts
"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type CalendarEvent = Database["public"]["Tables"]["calendar_events"]["Row"];

function useCalendarEvents(coupleId: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const supabase = createClient();

    // 1. fetch iniziale
    supabase
      .from("calendar_events")
      .select("*")
      .eq("couple_id", coupleId)
      .then(({ data }) => setEvents(data ?? []));

    // 2. subscription live per INSERT/UPDATE/DELETE sulla stessa coppia
    const channel = supabase
      .channel(`calendar_events:${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // oppure "INSERT" | "UPDATE" | "DELETE" separati
          schema: "public",
          table: "calendar_events",
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => {
          setEvents((current) => {
            if (payload.eventType === "INSERT") {
              return [...current, payload.new as CalendarEvent];
            }
            if (payload.eventType === "UPDATE") {
              return current.map((e) =>
                e.id === payload.new.id ? (payload.new as CalendarEvent) : e,
              );
            }
            if (payload.eventType === "DELETE") {
              return current.filter((e) => e.id !== (payload.old as CalendarEvent).id);
            }
            return current;
          });
        },
      )
      .subscribe();

    // 3. cleanup — fondamentale per non accumulare connessioni WebSocket
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId]);

  return events;
}
```

Stesso pattern per:
- **`pairing_invites`**: chi ha generato l'invito sottoscrive `filter:
  created_by=eq.<il proprio user id>` per far transitare automaticamente la
  UI di pairing a "accoppiato" quando l'altro accetta (`status` passa a
  `'accepted'`), senza bisogno di polling.
- **`profiles`**: sottoscrivere `filter: couple_id=eq.<coupleId>` per
  aggiornare live avatar/nome/colore del partner in Home.
- **`couples`**: sottoscrivere `filter: id=eq.<coupleId>` per riflettere
  live modifiche a `relationship_start_date` fatte dal partner in Profilo.
- **`notifications`** (`components/AppTopBar.tsx`): sottoscrivere solo
  `event: "INSERT"` con `filter: recipient_id=eq.<il proprio user id>` (non
  `couple_id`, a differenza delle altre — una notifica riguarda un
  destinatario specifico, non l'intera coppia) per aggiornare il badge non
  lette del campanello senza polling.

Nota: ricordarsi sempre `supabase.removeChannel(channel)` nel cleanup di
`useEffect` (o equivalente), altrimenti ogni remount del componente apre una
nuova connessione realtime senza chiudere le precedenti.

## Autenticazione + middleware di sessione

`lib/supabase/client.ts` e `lib/supabase/server.ts` creano i due client
(browser / server component) usando `@supabase/ssr`. Per rinnovare
automaticamente i cookie di sessione su ogni richiesta serve anche un
middleware Next.js: la logica è in `lib/supabase/middleware.ts`
(`updateSession`), ma il file `middleware.ts` alla ROOT del progetto (fuori
dallo scope file del backend agent) va creato da frontend/lead con:

```ts
// middleware.ts (root del progetto)
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

Il redirect applicativo (non loggato → `/login`, loggato ma non accoppiato →
`/pairing`) è responsabilità del frontend dentro quel file, dopo aver
chiamato `updateSession`.

## Cosa manca / rimandato a fasi successive

- Colonne specifiche per "appuntamenti confermati" (luogo, costo) — per il
  piano sono la stessa entità di `calendar_events`, arricchita in fase 2.
- Funzione di "scoppio di coppia" (unpair) — non richiesta nei task di fase
  1, da aggiungere in una migration dedicata quando serve (Profilo, fase 2+).
- `wishlist_items`, `messages` — fuori scope fase 1 per il backend (vedi
  `docs/PLAN.md` → Roadmap).
- Storage foto e Web Push (VAPID) — fasi successive.
