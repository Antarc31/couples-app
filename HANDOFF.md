# Handoff — couples-app

Se una sessione si interrompe, leggi questo file per primo: dice esattamente
a che punto siamo e cosa fare dopo. Per il design/architettura completi vedi
`docs/PLAN.md` (piano approvato dall'utente).

**Ultimo aggiornamento**: 2026-09-01 (giorno) — **Fix UX Calendario/
Appuntamenti/Home chiusi e verificati.** Piano approvato in
`/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`
(bottoni navigazione calendario, elimina/modifica evento, unificazione
Calendario→Appuntamenti per categoria "coppia", barre per evento in vista
Mese, timeline vista Giorno a durata reale, widget Home unificato
"Pensieri & Foto" con foto vere via Storage bucket). Tutto live, `tsc`
pulito, `npx jest` verde (**15 suite, 179 test**), 4 scenari e2e passano
insieme contro Supabase reale (incluso un nuovo test manuale del team per
il widget foto). Pulizia dati completata: 4 eventi calendario "coppia"
orfani (pre-esistenti al fix, creati durante i test) eliminati su
richiesta esplicita dell'utente, verificato 0 rimasti.

**Ultimo aggiornamento Feature B**: 2026-09-01 — **Eventi "speciale"
automatici (compleanno/anniversario) chiusi e verificati end-to-end.** Piano
approvato in `/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`,
sezione "Feature B — Eventi 'speciale' automatici" (lavorata in parallelo
alla Feature A — galleria foto — su file completamente disgiunti). Migration
`supabase/migrations/20260901060000_profile_birth_date_and_special_events.sql`
live e verificata dal lead con tutti e 6 gli step del piano, incluso il test
critico SECURITY DEFINER (partner B aggiorna un evento creato da partner A
senza errori RLS silenziosi). Profilo ora ha un form reale (data di nascita
sempre, data di inizio relazione solo se accoppiati) al posto del blocco
read-only. Vedi sezione "Feature B — Eventi 'speciale' automatici
(2026-09-01)" sotto per il dettaglio completo. `npx tsc --noEmit` pulito,
`npx jest` verde (**18 suite, 210 test**).

**Ultimo aggiornamento Feature A**: 2026-09-01 — **Galleria foto persistente
chiusa e verificata end-to-end.** Piano approvato in
`/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`,
sezione "Feature A — Galleria foto persistente" (lavorata in parallelo alla
Feature B — eventi speciale automatici — su file completamente disgiunti,
nessuna sovrapposizione). Prima di questa feature le foto mandate dal widget
"Pensieri & Foto" sparivano nel mazzetto swipeabile (solo le ultime 20,
nessuno storico sfogliabile); ora c'è `/home/foto`, una grid con infinite
scroll che carica TUTTA la cronologia. Vedi sezione "Feature A — Galleria
foto persistente (2026-09-01)" sotto per il dettaglio completo. `npx tsc
--noEmit` pulito, `npx jest` verde (**18 suite, 210 test** — coincide col
totale di Feature B perché entrambe le feature sono confluite nello stesso
albero), `npx next build` pulito. Verificato **contro Supabase reale** (non
solo mock): signup+pairing di due account reali, upload di foto vere via
widget Home, 30 righe seedate via REST per superare la PAGE_SIZE=24, scroll
reale in un vero Chromium con `IntersectionObserver` reale (non jsdom) che
carica correttamente tutte le 32 foto, overlay fullscreen apri/chiudi, e
visibilità RLS di coppia confermata dal secondo account.

**Ultimo aggiornamento Fase 2**: 2026-09-01 (notte) — **Fase 2 chiusa e verificata
end-to-end.** Appuntamenti (idee/confermati collegati al calendario) e
Wishlist (con modalità sorpresa a due livelli RLS+view) sono completi:
schema live, UI reale, `npx tsc --noEmit` pulito, `npx jest` verde
(**11 suite, 123 test**), e **3 scenari e2e passano insieme** contro
Supabase reale (`e2e/pairing-calendar.spec.ts`, `e2e/setup.smoke.spec.ts`,
`e2e/wishlist-surprise.spec.ts` — quest'ultimo passato al primo colpo,
zero bug). Vedi "Fase 2 — chiusura (2026-09-01 notte)" per il riepilogo
completo del lavoro fatto stanotte in autonomia (team di 3 agenti +
lead, mentre l'utente dormiva) prima della sezione "Verifica e2e reale"
di Fase 1 qui sotto.

## Mesiversario + fix proiezione ricorrenze Calendario (2026-09-01) ✅ chiuso

Piano approvato in `/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`,
sezione "3. Fix proiezione ricorrenze nel Calendario + mesiversario"
(lavorato in parallelo a "1. Colori distinti automatici al pairing" e
"2. 'Speciale' sparisce dal creatore/modificatore eventi" — file
completamente disgiunti: questo agente non ha toccato
`EventFormModal.tsx` né la migration di pairing).

**Bug pre-esistente risolto**: gli eventi calendario ricorrenti
(compleanno/anniversario, e ora anche mesiversario) sono salvati con la
loro data letterale (`starts_at`, es. l'anno di nascita) e comparivano nel
countdown Home (che proietta via `nextOccurrence`) ma MAI nella vista
Calendario vera e propria, che filtrava `starts_at` per range di data senza
mai proiettare sull'anno/mese effettivamente visualizzato.

**Migration** (`supabase/migrations/`, applicate e verificate live dal
lead) — **splittata in due file per sicurezza**, come indicato dal piano
(`ALTER TYPE ... ADD VALUE` non può essere usato nella stessa transazione
in cui viene aggiunto):
- `20260901070000_monthly_anniversary_and_recurrence.sql` — solo
  `alter type public.event_recurrence add value 'mensile';`.
- `20260901070100_monthly_anniversary_and_recurrence_part2.sql` —
  `couples.monthly_anniversary_event_id` (FK univoca nullable, `on delete
  set null`, stesso pattern di `anniversary_event_id`) + `create or replace
  function handle_couple_anniversary_event()` estesa per generare/
  aggiornare/cancellare ANCHE l'evento "Mesiversario" (`category:
  'speciale'`, `recurrence: 'mensile'`) insieme all'"Anniversario", stessa
  colonna sorgente `relationship_start_date`, stesso trigger già esistente
  `couples_sync_anniversary_event` (nessun nuovo trigger). **Resta
  SECURITY DEFINER** — stesso motivo critico già documentato/verificato per
  l'anniversario (partner non creatore che aggiorna la data).

**`lib/calendar-dates.ts`**:
- Nuova `projectOccurrences(startsAtIso, recurrence, rangeStart, rangeEnd):
  Date[]` — proietta TUTTE le occorrenze di un evento (eventualmente
  ricorrente) che cadono in un range, non solo la prossima da oggi
  (diverso da `nextOccurrence`, invariata nel contratto per il countdown
  Home). `'nessuna'`: la data letterale se in range. `'annuale'`: prova
  l'anno di `rangeStart`/`rangeEnd` ±1 per i bordi (es. range a cavallo di
  capodanno). `'mensile'`: itera mese per mese nel range (con un mese di
  margine prima dell'inizio), stesso giorno-del-mese di `starts_at`,
  clampato all'ultimo giorno del mese se troppo corto (avvio il 31 →
  28/29 febbraio) — può ritornare più occorrenze (es. un range di 6
  settimane con giorno 1 e giorno 31 della finestra).
- `nextOccurrence` estesa per `recurrence: 'mensile'` (stessa logica di
  clamp), tipizzata ora su `EventRecurrence` importato da
  `types/database.ts` invece del literal union locale `"nessuna" |
  "annuale"` — così il countdown Home (`app/(app)/home/page.tsx`, non
  toccato, nessuna modifica necessaria) funziona anche per il
  mesiversario senza altro codice.

**`components/calendar/CalendarView.tsx` — `loadEvents`**: prima faceva
un'unica query per range di data su `starts_at`. Ora due query in
parallelo: quella esistente (range di data, per gli eventi non ricorrenti)
+ una nuova senza filtro di data per gli eventi `recurrence != 'nessuna'`
della coppia (insieme piccolo per natura, ~4 al massimo: 2 compleanni,
anniversario, mesiversario). Gli eventi ricorrenti vengono SEMPRE dalla
proiezione (`projectOccurrences(ev.starts_at, ev.recurrence, gridStart,
gridEnd)`, una copia di visualizzazione per occorrenza con stesso
`id`/`title`/`category` e solo `starts_at` sovrascritto), MAI dalla prima
query — anche se la loro data letterale cade già nel range corrente — per
evitare un doppione nello stesso giorno (occorrenza letterale + proiettata
duplicate). Il tap su un'occorrenza proiettata apre comunque
`EventDetailSheet`/`EventFormModal` sulla riga REALE (stesso `id`):
modificarla sposta l'ancora `starts_at` del template — comportamento
accettabile e previsto dal piano, non gestito diversamente.

**`types/database.ts`**: `EventRecurrence` esteso con `'mensile'`;
`couples.Row`/`Relationships` esteso con `monthly_anniversary_event_id`
(assente da `Update`, mai impostabile dal client — stesso trattamento di
`anniversary_event_id`).

**Test**: `tests/lib/calendar-dates.test.ts` esteso — 3 nuovi casi
`nextOccurrence` per `'mensile'` (salto al mese successivo, resta sul mese
corrente, clamp fine mese) + nuovo blocco `describe("projectOccurrences",
...)` (8 test: `'nessuna'` in/fuori range, `'annuale'` in-range/fuori-range/
a cavallo di capodanno, `'mensile'` con 2 occorrenze in un range di 6
settimane, clamp fine mese 31 gennaio → 28 febbraio, array vuoto se nessun
mese valido nel range). Verificato che nessun altro file nel progetto
avesse un union type letterale hardcoded su `EventRecurrence` che si
sarebbe rotto con l'aggiunta di `'mensile'` (grep mirato, nessuna
occorrenza trovata oltre `types/database.ts`).

**Verifica finale**: `npx tsc --noEmit` pulito, `npx jest` verde (**18
suite, 224 test** — include lavoro concorrente di altri agenti sullo
stesso repo condiviso), `npx next build` pulito (stesso unico warning
preesistente non di competenza, middleware→proxy). **Verificato contro
Supabase reale** con uno script Node temporaneo (non committato, cancellato
a fine verifica): signup+pairing di due account nuovi, `relationship_start_
date` impostata al 2020-01-31 (deliberatamente il 31, per esercitare il
clamp), query reale di `calendar_events` per la coppia → sia "Anniversario"
(`recurrence: annuale`) sia "Mesiversario" (`recurrence: mensile`) presenti
con lo stesso `starts_at`, poi la stessa logica di `projectOccurrences`
applicata ai dati REALI restituiti dal DB per un mese 6 mesi nel futuro
(marzo 2027) e per febbraio 2027 esplicitamente (28 giorni, non bisestile)
→ mesiversario proiettato correttamente, con clamp 31→28 confermato su dati
reali, non solo in unit test. Il lead aveva già verificato separatamente
(prima di questa verifica) che il trigger crea entrambi gli eventi con i
campi corretti — vedi il suo messaggio nella sessione.

**Nessun gap reale da segnalare**: il piano è stato seguito nei dettagli,
incluso lo split della migration in due file (precauzione rivelatasi
corretta/non necessaria in pratica — applicata senza errori, ma comunque la
scelta più sicura). **Da fare dal lead**: 2 coppie di account di test
(`verify-monthly-a/b-*@example.com`, dalla verifica end-to-end di questo
agente) restano nel DB con le relative righe `calendar_events` — stesso
tipo di pulizia già fatta in passato per altri account di verifica (vedi
sezione Feature A sopra), non distruttiva/urgente ma da fare quando
comodo.

## Feature B — Eventi "speciale" automatici (2026-09-01) ✅ chiuso

Piano approvato in `/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`,
sezione "Feature B — Eventi 'speciale' automatici" (lavorata in parallelo
alla Feature A — galleria foto persistente, `components/home/*` +
`lib/messages-actions.ts` — su file completamente disgiunti, nessuna
sovrapposizione). Prima di questa feature gli eventi calendario categoria
'speciale' (oro: compleanni/anniversario) si potevano creare SOLO a mano dal
Calendario; ora l'app li genera/aggiorna da sola quando l'utente imposta la
data di nascita (Profilo) o la data di inizio relazione (Profilo, gestibile
da entrambi i partner).

**Migration `supabase/migrations/20260901060000_profile_birth_date_and_special_events.sql`
— LIVE, verificata dal lead con tutti e 6 gli step del piano**:
- Schema: `profiles.birth_date` (date, nullable) + `profiles.birthday_event_id`
  (FK univoca nullable verso `calendar_events`, `on delete set null`) +
  `couples.anniversary_event_id` (stessa forma). Stesso pattern già collaudato
  di `appointments.calendar_event_id`.
- Trigger `profiles_sync_birthday_event` (`before update of birth_date,
  couple_id` — column-list deliberata: include anche `couple_id` così se
  `birth_date` viene impostata PRIMA del pairing, l'evento si genera
  retroattivamente quando `accept_pairing_invite` imposta `couple_id`, senza
  dover toccare quella RPC) e `couples_sync_anniversary_event` (`before
  update of relationship_start_date`, invocato indirettamente dalla RPC
  `set_relationship_start_date` già esistente). Logica identica per entrambi:
  data null → cancella l'evento collegato e azzera il riferimento; non
  accoppiati (solo per profiles) → nessun evento; altrimenti upsert su
  `calendar_events` (`category: 'speciale'`, `recurrence: 'annuale'`,
  `all_day: true`, titolo "Compleanno di {display_name}"/"Anniversario").
- **Entrambe le funzioni trigger sono `SECURITY DEFINER`** (con `set
  search_path = public`) — punto critico del piano, non un dettaglio
  opzionale: le policy UPDATE/DELETE di `calendar_events` permettono la
  scrittura solo a `created_by = auth.uid()` OPPURE `category = 'coppia'`, e
  gli eventi 'speciale' non hanno quell'eccezione. Senza SECURITY DEFINER,
  se partner A imposta per primo la data (evento creato con `created_by = A`)
  e poi partner B la aggiorna via `set_relationship_start_date`, l'update
  interno del trigger girerebbe con i privilegi RLS di B (non creatore): la
  RLS filtrerebbe silenziosamente la riga, zero errori ma zero aggiornamento.
  **Verificato dal lead esattamente questo scenario contro Supabase reale**:
  A imposta la data (evento creato, `created_by=A`), B la aggiorna con una
  data diversa → stesso event id (nessun duplicato), `starts_at` aggiornato
  correttamente, HTTP 204.
- **Comportamento "elimino l'evento a mano" verificato**: DELETE diretto
  dell'evento generato → `birthday_event_id`/`anniversary_event_id` tornano
  NULL via FK `on delete set null`, nessuna logica aggiuntiva necessaria.
  Ri-impostare la stessa data dal Profilo rigenera l'evento (un trigger
  `before update of birth_date` scatta anche ri-assegnando lo stesso valore,
  comportamento standard Postgres) — verificato dal lead.
- **Caso più delicato del piano, verificato dal lead**: `birth_date`
  impostata PRIMA del pairing → nessun evento creato, `birthday_event_id`
  resta null; dopo il pairing (`accept_pairing_invite`) → evento creato
  RETROATTIVAMENTE senza alcun intervento aggiuntivo lato codice.
- Visibilità simmetrica confermata da entrambi gli account sulla query
  `calendar_events?category=eq.speciale`.

**Altri file modificati**:
- `types/database.ts` — `birth_date`/`birthday_event_id` aggiunti a
  `profiles.Row`/`Insert`/`Update` (solo `birth_date` è settabile dal client,
  `birthday_event_id` no — stesso trattamento di `couple_id`);
  `anniversary_event_id` aggiunto a `couples.Row` (`Update` resta `never`, si
  passa dalla RPC `set_relationship_start_date`).
- `lib/current-couple.ts` — select `profiles` estesa con `birth_date`,
  nuovo campo `birthDate` in `CurrentCoupleData` (profilo dell'utente
  corrente, non del partner).
- **Nuovo `lib/profile-actions.ts`**: `updateBirthDate(birthDate: string |
  null)` (update diretto su `profiles`, RLS `profiles_update_self` già lo
  permette, nessuna RPC necessaria) e `setRelationshipStartDate(date:
  string)` (chiama la RPC `set_relationship_start_date` già esistente da
  Fase 1, mai collegata a nessuna UI fino ad ora).
- **Nuovo `components/profilo/ProfileEditForm.tsx`** (client): due sezioni
  Card indipendenti con stato di salvataggio/errore separato — data di
  nascita (sempre visibile) e data di inizio relazione (**solo se
  `isPaired`**, la RPC fallisce esplicitamente altrimenti — stesso principio
  di `EventDetailSheet.canEdit`, non mostrare un'azione destinata a
  fallire). Niente `window.confirm`/`alert` nativi. `router.refresh()` dopo
  ogni salvataggio riuscito, così Home (countdown "prossima data speciale")
  si aggiorna.
- `app/(app)/profilo/page.tsx` — il blocco read-only "Data di inizio
  relazione" sostituito da `<ProfileEditForm birthDate={data.birthDate}
  isPaired={data.partner !== null} relationshipStartDate={data.couple
  ?.relationshipStartDate ?? null} />`.
- `app/(app)/home/page.tsx` — **nessuna modifica, come da piano**:
  `nextSpecial` legge già `calendar_events where category='speciale'`,
  funziona automaticamente ora che il trigger popola righe reali. Verificato
  manualmente che la query è quella giusta, nessun edit necessario.

**Test**:
- `tests/lib/profile-actions.test.ts` (nuovo, 7 test): `updateBirthDate`
  (non autenticato, successo, `null` per svuotare, propagazione errore) e
  `setRelationshipStartDate` (data vuota rifiutata senza chiamare la RPC,
  successo, propagazione errore RPC — es. "non accoppiato").
- `tests/components/profilo/ProfileEditForm.test.tsx` (nuovo, 7 test):
  precompilazione (valorizzata e vuota), sezione anniversario **assente dal
  DOM** (non solo nascosta via CSS) se `isPaired` è false, submit di
  entrambe le sezioni con `router.refresh()` sul successo, messaggio
  d'errore mostrato e **nessun** `router.refresh()` sul fallimento per
  entrambe. `next/navigation` mockato localmente (nessun mock globale
  preesistente nel progetto per `useRouter`, primo test che ne aveva
  bisogno). Per gli input `type="date"` usato `fireEvent.change` invece di
  `userEvent.type` — `user-event` v14 tratta i date-input come campi
  segmentati e non accetta in modo affidabile una stringa con trattini in
  digitazione carattere-per-carattere sotto jsdom.
- `tests/lib/current-couple.test.ts` — aggiornato per `birth_date`/
  `birthDate` (precompilazione null, valorizzato, per l'utente corrente non
  per il partner).

Stato finale: `npx tsc --noEmit` pulito, `npx jest` verde — **18 suite, 210
test** (14 nuovi/estesi da questa feature). Nessun gap reale da segnalare:
il piano è stato seguito nei dettagli, incluso il punto critico SECURITY
DEFINER, verificato funzionalmente e non solo in teoria dal lead contro
Supabase reale.

## Feature A — Galleria foto persistente (2026-09-01) ✅ chiuso

Piano approvato in `/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`,
sezione "Feature A — Galleria foto persistente" (lavorata in parallelo alla
Feature B — eventi speciale automatici, `app/(app)/profilo/*` +
`lib/profile-actions.ts` + `lib/current-couple.ts` + `types/database.ts` +
`supabase/migrations/*` — su file completamente disgiunti, nessuna
sovrapposizione, nessuna migration necessaria per questa feature: schema
`messages`/bucket `couple-photos` già pronti da Fase 1). Prima di questa
feature le foto mandate dal widget "Pensieri & Foto" (Home) sparivano nel
mazzetto swipeabile — solo le ultime 20, nessuno storico sfogliabile.

**Nuovi file**:
- `app/(app)/home/foto/page.tsx` — server component, stesso guard pattern di
  `home/page.tsx` (`getCurrentCoupleData` + redirect a `/pairing` se non
  accoppiati). Route annidata sotto `/home`, NON una sesta tab:
  `components/AppTabBar.tsx` ha un union type stretto a 5 route e non è
  stato toccato — la sua logica attiva già "Home" su `/home/foto` via
  `pathname.startsWith(tab.href + "/")`.
- `components/home/PhotoGallery.tsx` (client) — grid `grid-cols-3` con
  scroll verticale (niente drag/mazzetto), infinite-load via
  `IntersectionObserver` su un sentinel in fondo alla grid (rootMargin
  300px per anticipare il fetch prima che l'utente veda lo scatto), tap su
  una foto → overlay fullscreen (stesso pattern modal di
  `EventDetailSheet`/i menu di `MemoriesDeck`: `fixed inset-0`, backdrop,
  click fuori per chiudere, bottone "✕"). `nextCursor`/`hasMore` tenuti
  anche in `useRef` oltre che in state, per essere letti in modo sincrono
  (non stale) dentro il callback dell'`IntersectionObserver` e dentro
  `loadMore` (guardia anti-doppio-fetch `loadingMoreRef`).

**File modificati**:
- `lib/messages-actions.ts`:
  - Nuova `listPhotoMemories(before?: string, limit = 24):
    Promise<PhotoMemoriesPage | ActionError>` — `PhotoMemoriesPage = {
    items: Thought[], nextCursor: string | null }`. Query `.eq("type",
    "photo")` (+ `.lt("created_at", before)` se passato) `.order("created_at",
    { ascending: false }).limit(limit)`, sfrutta l'indice esistente
    `(couple_id, created_at desc)` (RLS filtra già per coppia, nessun
    `.eq("couple_id", …)` esplicito necessario). Euristica `hasMore`: se la
    pagina torna esattamente `limit` righe si assume che ce ne siano altre
    (un'eventuale pagina successiva vuota costa solo una chiamata in più,
    mai un falso negativo).
  - Estratta la risoluzione path→signed URL (prima duplicata solo dentro
    `listRecentThoughts`) in un helper condiviso `resolveSignedPhotoUrls`,
    più `mapRowToThought` per il mapping riga→`Thought` — entrambe usate ora
    da `listRecentThoughts` e `listPhotoMemories`, stessa logica di
    degradazione a `photoUrl: null` se una singola `createSignedUrl`
    fallisce (mai far fallire l'intera pagina per una foto sola).
- `components/home/MemoriesDeck.tsx` — link "Vedi tutte le foto" (`next/link`
  verso `/home/foto`) nell'header della card, accanto all'indicatore
  "Carico la foto…". Chiude il gap già previsto in `docs/PLAN.md`, mai
  implementato prima d'ora.

**Test**:
- `tests/lib/messages-actions.test.ts` — nuovo blocco `describe("listPhotoMemories", …)`
  (8 test): non autenticato, filtro `type='photo'` + mapping + signed URL,
  `.lt("created_at", before)` passato solo quando `before` è definito,
  `nextCursor` = `created_at` dell'ultima riga quando la pagina è piena vs
  `null` quando è più corta del limite, propagazione errore query, `data:
  null` → `{ items: [], nextCursor: null }`, degrado a `photoUrl: null` se
  `createSignedUrl` fallisce. Nuovo helper `makePhotoQueryMock` (stesso
  stile tipizzato di `makeSelectOrderLimitMock` già presente) per la catena
  `.select().eq()[.lt()].order().limit()`.
- `tests/components/home/PhotoGallery.test.tsx` (nuovo, 7 test) — stato
  vuoto, propagazione errore prima pagina, render della grid, caricamento
  pagina successiva quando il sentinel "entra" nel viewport (con
  `nextCursor` passato come `before`), nessuna richiesta ulteriore quando
  `nextCursor` è già `null`, apertura/chiusura overlay fullscreen con
  mittente+didascalia, didascalia di default (📷, foto senza caption) non
  mostrata nell'overlay. `IntersectionObserver` non esiste in jsdom (stesso
  tipo di buco già documentato per `PointerEvent` in
  `tests/components/home/MemoriesDeck.test.tsx`): sostituito con una classe
  fake che registra l'ultima istanza/il suo callback, così i test simulano
  "il sentinel è entrato nel viewport" chiamando il callback a mano
  (wrappato in `act()`) invece di dipendere da un vero scroll, impossibile
  da simulare in modo affidabile sotto jsdom.
- `tests/components/home/MemoriesDeck.test.tsx` — nuovo test per il link
  "Vedi tutte le foto" (`href="/home/foto"`).

**Verifica manuale reale contro Supabase reale (non solo mock)**: script
Playwright standalone (non committato — vive solo nello scratchpad della
sessione, non fa parte della suite e2e permanente del repo) che guida due
Chromium reali attraverso l'intero flusso: signup + pairing di due account
nuovi, upload di 2 foto vere via il widget "Pensieri & Foto" (upload reale
sul bucket Storage, signed URL reale, card visibili nel mazzetto), seed via
REST (stesso token/RLS dell'app) di altre 30 righe `messages` type=photo per
superare `PAGE_SIZE=24`, poi su `/home/foto`: prima pagina esattamente 24
tile, **scroll reale del browser con `IntersectionObserver` reale** (non
jsdom) che carica correttamente le restanti 8 fino a 32/32 foto totali, tap
su una foto → overlay fullscreen, chiusura con la "✕", e verifica RLS che
il partner B veda la stessa galleria. Tutti i controlli passano.

**Finding non bloccante, degno di nota** (non un bug da fixare in questo
giro): durante la prima versione del seed di test, inserire 30 righe in un
**unico** statement `INSERT` multi-riga ha dato a tutte le righe lo
**stesso** `created_at` — Postgres risolve `now()` una sola volta per
statement/transazione (`messages.created_at` è `timestamptz not null
default now()`, vedi `supabase/migrations/20260831190000_messages.sql`).
Con un cursore `.lt("created_at", before)` su un valore non univoco, righe
con lo stesso timestamp del cursore vengono saltate — verificato
riproducendo il bug (32 foto attese, solo 26 caricate) e poi confermando che
distanziando i `created_at` (1s l'uno dall'altro, il caso realistico) tutte
e 32 le foto si caricano correttamente. **Nell'uso reale questo non può
succedere**: le foto si mandano una alla volta tramite `sendPhotoThought`,
round-trip separati, quindi `created_at` è sempre distinto anche solo per
microsecondi — nessuna azione richiesta, ma vale la pena saperlo se in
futuro si aggiungesse un qualunque path di scrittura bulk su `messages`
(es. un import) — in quel caso conviene un cursore composito
`(created_at, id)` invece del solo `created_at`.

**Dati di test — puliti dal lead dopo la consegna**: erano rimasti 6 account
di verifica (`verify-gallery-a/b-*@example.com`, 3 coppie da run ripetute
della verifica manuale) con le relative righe `messages`/`calendar_events`.
Il lead ha cancellato `auth.users` per quei 6 account con connessione
diretta al DB (cascata automatica su `profiles`→`couples`→`messages`/
`calendar_events` via FK `on delete cascade`) — verificato 0 righe residue
su tutte e tre le tabelle. **Unico residuo accettato**: 6 file immagine nel
bucket Storage `couple-photos` non sono stati cancellabili via SQL diretto
(Supabase blocca `DELETE` diretto su `storage.objects`, richiede la Storage
API con una service role key non disponibile in questa sessione) — restano
nel bucket ma sono file di pochi KB in un path che non corrisponde più a
nessuna coppia reale (irraggiungibili, la cartella `{couple_id}/...` non
matcherà mai più nessun `current_couple_id()` dato che quella coppia non
esiste più): residuo minore, non un problema di sicurezza/privacy, lasciato
così.

Stato finale: `npx tsc --noEmit` pulito, `npx jest` verde. Nessun gap reale
da segnalare sull'implementazione stessa — il piano è stato seguito nei
dettagli (helper condiviso per le signed URL, cursore su `created_at`,
euristica `hasMore`, link da `MemoriesDeck`); l'unico punto degno di nota è
il comportamento teorico del cursore su timestamp non univoci descritto
sopra, non azionabile nell'uso reale dell'app.

## Fix UX Calendario/Appuntamenti/Home (2026-09-01) — Gruppo Home ✅ chiuso

Piano completo in `/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`
(5 problemi segnalati dall'utente dopo aver provato l'app dal vivo, lavoro
diviso in "Gruppo Calendario/Appuntamenti" e "Gruppo Home" assegnati a due
agenti in parallelo su file disgiunti). Questa voce copre solo il **Gruppo
Home** — punto 7 del piano, widget unificato "Pensieri & Foto". Il Gruppo
Calendario (punti 1-6, `CalendarView.tsx`/`EventFormModal.tsx`/nuovo
`lib/calendar-actions.ts`) è lavoro di un agente diverso, non coperto qui.

**Correzioni post-consegna (2026-09-01, dopo test dal vivo dell'utente su
mobile)**, fatte dal lead direttamente su `components/home/MemoriesDeck.tsx`:
- **Swipe ora bidirezionale**: prima `topIndex` avanzava solo in avanti
  (`Math.min(i+1, ...)`) — una volta scartata, una card spariva per il
  resto della sessione ("la carta va persa", segnalato dall'utente). Ora
  swipe a sinistra = avanti, swipe a destra = indietro (`goTo("next"|"prev")`),
  nessuna card viene mai rimossa da `thoughts`, solo l'indice di quale
  mostrare in cima si sposta in entrambe le direzioni. Nuovo test in
  `tests/components/home/MemoriesDeck.test.tsx` ("swipe a destra torna
  alla card precedente").
- **Pulsante "+" spostato dentro la card**: prima era `fixed bottom-20
  right-5` sull'intera pagina, scollegato visivamente dal widget "Pensieri
  & Foto" (segnalato come "non si capisce il nesso"). Ora è `absolute
  bottom-3 right-3` dentro un wrapper `relative` attorno alla `Card`,
  quindi resta ancorato all'angolo della card e si muove con lei scorrendo
  la Home, invece di fluttuare fisso sulla pagina.

`npx tsc --noEmit` pulito, `npx jest` verde (15 suite, 180 test).

**Premessa già chiusa dal lead prima di iniziare**: migration del bucket
Storage privato `couple-photos` + RLS su `storage.objects`
(`supabase/migrations/20260901050000_couple_photos_storage.sql`) già live e
verificata funzionalmente dal lead con due account reali prima di assegnare
il task.

**Consegnato**:
- `lib/messages-actions.ts`: nuova `sendPhotoThought(file, caption?)` —
  upload su `couple-photos` con path `{couple_id}/{uuid}.{ext}` (obbligatorio
  per la RLS), poi insert in `messages` (`type: 'photo'`, `photo_url` = path,
  non URL pubblico), rollback best-effort del file caricato se l'insert
  fallisce. `content` non può essere vuoto (check DB): usa la caption se
  fornita, altrimenti placeholder `"📷"` (mai mostrato come didascalia in UI).
  `listRecentThoughts()` estesa per risolvere in parallelo i `photo_url`
  (path) delle righe `type='photo'` in signed URL (`createSignedUrl`, TTL
  3600s) prima di restituire i `Thought[]` — i componenti non vedono mai il
  path grezzo del bucket. Una foto il cui signed URL non si genera (es. file
  rimosso) degrada a `photoUrl: null` senza far fallire l'intera lista.
- **Nuovo `components/home/MemoriesDeck.tsx`**, sostituisce sia
  `ThoughtsSection.tsx` sia `PhotoStrip.tsx` (entrambi rimossi, insieme a
  `mockPhotos`/`PhotoItem` in `app/_data/mock.ts`, non più usati altrove).
  Mazzetto di card impilate (max 3 visibili, offset/scala decrescenti),
  card testo/reminder = sfondo bianco solo testo, card foto = immagine piena
  card con overlay mittente/timestamp + didascalia opzionale. Drag
  orizzontale via pointer events nativi (`onPointerDown/Move/Up`, nessuna
  libreria di gesture nel progetto): oltre soglia distanza (100px) o
  velocità (0.5px/ms) la card scivola via (CSS transform + easing elastico)
  e si passa alla successiva, sotto soglia torna al centro. Un solo bottone
  "+" (`fixed bottom-20 right-5`) apre un mini-sheet con due scelte: "💌
  Manda un pensiero" (riusa il compose testuale) e "📷 Manda una foto"
  (`<input type="file" accept="image/*" capture>` nascosto, aria-label
  "Seleziona foto" per testabilità). Reazione a cuore (ottimistica +
  rollback) invariata, stesso pattern di `toggleThoughtReaction` già
  esistente. `app/(app)/home/page.tsx` aggiornato per montare
  `<MemoriesDeck>` al posto dei due componenti rimossi.
- **Gap noto scoperto e chiuso durante l'implementazione**:
  `dom-testing-library` (usato da `@testing-library/react`) non riesce a far
  passare `clientX`/`pointerId` tramite `fireEvent.pointerDown(el, {...})`
  sotto jsdom, perché `window.PointerEvent` non esiste in jsdom e la libreria
  ricade sul costruttore nativo `Event`, che ignora silenziosamente le
  chiavi extra dell'init dict — bug scoperto con un repro isolato prima di
  scrivere i test di drag. Fix nei test: costruire l'evento a mano
  (`new Event(type, {bubbles, cancelable})` + `Object.assign` delle
  proprietà extra) e passarlo all'overload a due argomenti di `fireEvent`.
  Documentato con un commento esteso in testa a
  `tests/components/home/MemoriesDeck.test.tsx` per non far riscoprire il
  problema a chi scriverà il prossimo test di drag/pointer nel progetto.
- **Test**: `tests/lib/messages-actions.test.ts` esteso (+8 test:
  `sendPhotoThought` — errori auth/pairing, upload+insert col path corretto,
  caption custom, propagazione errore upload, rollback su errore insert; e
  risoluzione signed URL in `listRecentThoughts`, incluso il caso di
  degrado). `tests/components/home/MemoriesDeck.test.tsx` nuovo (7 test:
  invio testo in cima al mazzetto, invio foto via upload mockato, swipe oltre
  soglia passa alla card successiva, drag sotto soglia non cambia card,
  reazione cuore su card testo E su card foto separatamente, stato vuoto).
  `tests/components/home/ThoughtsSection.test.tsx` rimosso (componente
  sostituito). Stato finale: **15 suite, 179 test**, tutti verdi (include
  anche lavoro concorrente di altri agenti sullo stesso repo condiviso
  nella stessa sessione). `npx tsc --noEmit` pulito **sui file di questo
  task** — al momento della consegna `components/calendar/CalendarView.tsx`
  ha errori di tipo transitori dovuti a un refactor in corso in parallelo
  dell'agente sul Gruppo Calendario (`DayTimeline` duplicato,
  `MAX_DOTS`/`formatTime`/`CATEGORY_LABELS` non definiti) — non causati né
  toccati da questo lavoro, verificato confrontando con un `tsc` pulito
  eseguito come baseline prima di iniziare.
- **Verifica manuale reale eseguita** (non solo mock, come richiesto dal
  piano data l'alta rischiosità tecnica della feature): script Playwright
  temporaneo (scritto, eseguito con `E2E_SUPABASE_READY=1` contro il
  progetto Supabase cloud reale, poi cancellato — non fa parte della suite
  permanente) con due account veri accoppiati: A manda un pensiero di testo
  e una foto reale (JPEG generato al volo), entrambi appaiono nel mazzetto
  di A con l'immagine effettivamente caricata (`naturalWidth > 0`, non
  un'icona rotta); B ricarica `/home` e vede sia il pensiero sia la foto,
  foto anch'essa caricata correttamente via signed URL — confermato con
  screenshot di entrambe le viste. **RLS Storage verificata anche in
  negativo** con uno script Node a parte (`@supabase/supabase-js` diretto,
  non tramite l'app): un terzo account NON accoppiato con A tenta
  `createSignedUrl`/`list` sul path della foto di A → bloccato in entrambi
  i casi (`"Object not found"` / lista vuota), mentre B (partner reale)
  ottiene correttamente la signed URL — nessuna fuga di dati foto tra
  coppie diverse. Tutti i file temporanei di verifica (script, fixture
  immagine, screenshot, spec e2e ad-hoc) rimossi a fine sessione.
- **Nessun gap reale da segnalare**: lo storage/RLS erano già stati
  verificati dal lead prima dell'assegnazione, il resto del lavoro (codice
  client + UI) non ha richiesto nuovo schema. Unico item degno di nota è il
  bug di `dom-testing-library`+jsdom sui pointer event sopra, già
  documentato/risolto nei test stessi.

## Fix UX Calendario/Appuntamenti (2026-09-01/02) — Gruppo Calendario

Lavoro svolto in autonomia sul "Gruppo Calendario/Appuntamenti" del piano
approvato `~/.claude/plans/ho-notato-delle-cose-mossy-sketch.md` (5 problemi
reali segnalati dall'utente dopo aver provato l'app dal vivo). Scope di
questo agente: punti 1, 2, 3, 4, 6 del piano (non il punto 7 "Home", assegnato
in parallelo a un altro agente su file diversi — `components/home/*` e
`lib/messages-actions.ts` non toccati). **Nessuna migration necessaria**
(confermato dal piano e verificato in pratica): tutto il lavoro si appoggia
su RLS/trigger già esistenti da Fase 1/2.

**Punto 1 — Affordance bottoni navigazione + fix range fetch**
(`components/calendar/CalendarView.tsx`): i bottoni ‹/› di Mese e Giorno
avevano solo un glifo grigio chiaro senza sfondo/bordo, percepiti come testo
decorativo — ora `h-9 w-9`, `bg-surface`, `shadow-sm`, `text-ink`,
`active:scale-95` per feedback al tap. Bug latente trovato e corretto (era
già documentato nel piano): `loadEvents` caricava SOLO il range della
griglia mese di `monthAnchor`, non `selectedDate` — navigando in vista
Giorno abbastanza da uscire dal mese caricato, l'agenda poteva mostrare
"nessun evento" anche quando in realtà ce ne sono. Fix: il range di fetch è
ora l'unione tra la griglia mese corrente e una finestra di ±7 giorni
intorno a `selectedDate`.

**`lib/calendar-actions.ts`** (nuovo — il Calendario era l'unica feature
senza un modulo azioni dedicato): `createCalendarEvent`, `updateCalendarEvent`,
`deleteCalendarEvent`, stesso pattern di `lib/appointments-actions.ts` ma
senza derivare user/couple via `auth.getUser()` (i chiamanti hanno già
`coupleId`/`createdBy` come prop). `deleteCalendarEvent` si affida
interamente alla RLS `calendar_events_delete_own_or_couple_category` già
esistente; il trigger `appointments_status_sync_trigger` (Fase 2) degrada
già automaticamente l'appuntamento collegato a `'idea'` se il
`calendar_event` viene cancellato — nessun lavoro lato client aggiuntivo.
Test: `tests/lib/calendar-actions.test.ts` (10 test).

**Punto 3 — Dettaglio/modifica/elimina evento** (prima non si poteva fare
né l'una né l'altra): nuovo `components/calendar/EventDetailSheet.tsx`
(bottom sheet aperto al tap su un evento, sia da `DayAgendaSheet` sia da
`DayTimeline`), con `canEdit` calcolato lato client rispecchiando la RLS
(creatore sempre, partner solo per categoria 'coppia' — solo per non
mostrare azioni destinate a fallire, la RLS resta l'unica vera fonte di
verità) e conferma a due step prima della delete (niente `window.confirm`).
`EventFormModal.tsx` ha guadagnato `mode?: "create" | "edit"` +
`initial?: CalendarEventRow` (stesso pattern di `AppointmentFormModal.tsx`).
`DayAgendaSheet.tsx` ora accetta `onEventClick`. Test:
`tests/components/calendar/EventDetailSheet.test.tsx` (11 test).

**Punto 4 — Unificazione Calendario → Appuntamenti per categoria "coppia"**:
in creazione, scegliere categoria "coppia" in `EventFormModal.tsx` mostra
ora due campi opzionali Luogo/Costo (stesso pattern UI di
`AppointmentFormModal.tsx`) e il submit chiama `createConfirmedAppointment()`
(già esistente in `lib/appointments-actions.ts`) invece dell'insert diretto
— così l'evento compare anche in Appuntamenti → Confermati, chiudendo il
bug "creare un evento coppia dal Calendario non lo fa comparire in
Appuntamenti" segnalato dall'utente. Gap colmato come indicato dal piano:
`ConfirmAppointmentEventInput` estesa con `tag?`/`notes?`, passati
nell'insert di `calendar_events` sia in `confirmAppointment` sia in
`createConfirmedAppointment` (prima si perdevano). **Scelta di scope
esplicita** (dal piano, non improvvisata): in modifica, il salvataggio
tocca SEMPRE E SOLO `calendar_events` via `updateCalendarEvent`, qualunque
sia la categoria scelta — mai crea/rimuove retroattivamente il
collegamento Appuntamenti; un hint testuale lo segnala quando la categoria
selezionata in edit è "coppia". Test: nuovi casi in
`tests/lib/appointments-actions.test.ts` (asserzioni tag/notes
nell'insert, 25 test totali ora) e nuovo
`tests/components/calendar/EventFormModal.test.tsx` (10 test). Esteso
`e2e/pairing-calendar.spec.ts` con un passo 8 che verifica che l'evento
"coppia" creato da A compaia in `/appuntamenti` per ENTRAMBI gli account
(RLS di `appointments` a livello di coppia) — non eseguito in questo
sandbox (stesso limite noto, richiede `E2E_SUPABASE_READY=1` contro
Supabase reale), verificato solo che `npx playwright test --list` lo
parsi correttamente.

**Punto 2 — Vista Mese: barre invece di pallini** (`CalendarView.tsx`):
nessuna nuova funzione colore — riusa `eventColor()` così com'è (nessuna
modifica a `lib/calendar-colors.ts`), cambia solo la FORMA. Stack verticale
di barre sottili (`h-[3px] w-full rounded-full`), max 4 visibili prima di
un "+N" testuale, in ordine cronologico (i dati arrivano già ordinati da
`starts_at` ascendente).

**Punto 6 — DayTimeline a posizionamento assoluto**: estratto da funzione
locale dentro `CalendarView.tsx` a componente proprio
`components/calendar/DayTimeline.tsx` (per testabilità, come suggerito dal
piano). Prima un evento 9:00-17:00 occupava visivamente solo la riga delle
9:00, indistinguibile da un evento di 15 minuti. Ora: contenitore relativo
alto `hours.length * ROW_HEIGHT` (18 ore × 52px), eventi posizionati con
`top`/`height` proporzionali a inizio/durata reali (altezza minima
garantita 28px per eventi brevi o senza `ends_at`), griglia oraria di
sfondo come semplici righe divisorie. Sovrapposizioni: eventi raggruppati
in cluster per transitività (non uno scheduling sofisticato — pattern
semplice, larghezza divisa per il numero di eventi nel cluster, colonna
assegnata greedily). `layoutTimedEvents` esportata come funzione pura
testabile senza montare il componente. **Nota per l'e2e**: il DOM
dell'evento nella card resta un `<div>` (con `role="button"`/`tabIndex`
invece di un `<button>` reale) apposta per non rompere il locator
`page.locator("div", { hasText: eventTitle }).last()` già usato da
`e2e/pairing-calendar.spec.ts` per confrontare il colore tra i due
account. Test: `tests/components/calendar/DayTimeline.test.tsx` (12 test:
altezza proporzionale alla durata, posizione da minuti di inizio, altezza
minima garantita, clustering/colonne per sovrapposizioni dirette e
transitive, interazione tap → `onEventClick`).

**Verifica**: `npx tsc --noEmit` pulito e `npx jest` verde dopo ogni punto
(non solo alla fine, come richiesto) — stato finale **15 suite, 179 test**
(erano 11 suite/123 test a fine Fase 2). `npx next build` pulito
(unico warning preesistente: deprecazione `middleware.ts` → `proxy`, non
di competenza di questo lavoro). `npm run lint` non riverificato: bug
ambientale eslint 9/FlatCompat già noto e non bloccante, segnalato da
tempo, non affrontato in questo giro (fuori scope).

**Non fatto, deliberatamente fuori scope per questo agente** (di
competenza del lead, vedi piano): la pulizia dati (DELETE eventi coppia
orfani senza appuntamento collegato) — operazione distruttiva sul DB reale
da eseguire solo dopo che questo lavoro sul punto 4 è verificato in
produzione, con conteggio di anteprima mostrato all'utente prima. Nessuna
verifica manuale in `npm run dev` eseguita da questo agente (nessuna
credenziale Supabase disponibile) — da fare dal lead/utente, incluse le
verifiche esplicite indicate dal piano (durate diverse/sovrapposte in
vista Giorno, permessi RLS a due account su eventi 'coppia' vs
'personale', comparsa in Appuntamenti, barre per-partner in vista Mese).

## Fase 2 — chiusura (2026-09-01 notte)

Lavoro svolto in autonomia durante la notte, su richiesta esplicita
dell'utente ("vorrei che fosse tutto automatizzato così che posso
dormire"). Team di 3 agenti (`backend2`, `frontend2`, `qa2`, nomi diversi
da Fase 1 perché i vecchi agenti in-process non erano più raggiungibili
dopo l'interruzione di sessione) + il lead che ha fatto da tramite per
tutte le operazioni sul database (gli agenti non hanno credenziali
Supabase).

**Setup necessario prima di iniziare**: l'utente ha creato un progetto
Supabase cloud (piano free) e fornito, su richiesta del lead, la
**connection string del "Session pooler"** (non "Direct connection": quella
richiede IPv6, non supportato dalla rete dell'utente — vedi anche
"Verifica e2e reale" sotto per lo stesso problema incontrato la sera
prima). Con quella il lead ha potuto:
- Riconciliare la cronologia migration della CLI (`supabase migration
  repair --status applied ...`) con le 7 migration già applicate a mano
  via SQL Editor la sera prima, così `supabase db push` ha potuto
  funzionare in automatico da lì in poi senza altro copia-incolla manuale.
- Applicare le migration di Fase 2 direttamente via `supabase db push
  --db-url '...'` (niente più rischio di troncamento da copia-incolla
  browser: il CLI legge il file direttamente).
- **La password del database non è stata salvata da nessuna parte** (né
  in `.env.local`, né altrove): resta nota solo se l'utente la ridà in
  una sessione futura, per scelta deliberata di sicurezza.

**Schema aggiunto** (4 migration, tutte live e verificate funzionalmente
dal lead con account reali via curl prima di dare il via libera alla UI):
- `appointments` (idee senza data + confermati collegati a un
  `calendar_event` via `calendar_event_id` univoco nullable). RLS: piano
  di coppia, entrambi i partner modificano/eliminano qualunque riga.
- `wishlist_items` + view `wishlist_feed` per la **modalità sorpresa**:
  la tabella base nega del tutto la riga a chi non è il creatore mentre è
  sorpresa attiva; la view (`security_invoker = false`, `security_barrier
  = true`) espone tutte le righe della coppia con i campi sensibili
  (titolo/descrizione/prezzo/link/foto) nulled per le sorprese altrui
  attive, più un flag `is_hidden_surprise`. Nessuna policy/grant DELETE
  (mai cancellare, solo completare). Verificato end-to-end con due account
  reali: creatore vede tutto, destinatario riceve riga vuota su
  `wishlist_items` diretto e placeholder mascherato su `wishlist_feed`,
  non può UPDATE né DELETE, dopo il completamento vede tutto rivelato.
- `push_subscriptions` per Web Push — schema pronto, RLS solo proprie
  righe.
- Trigger di correzione (`appointments_status_sync_trigger`, migration
  separata trovata da backend2 in autorevisione **dopo** che le prime 3
  erano già live): senza di esso, cancellare un `calendar_event` collegato
  a un appuntamento confermato avrebbe fatto fallire l'intera DELETE per
  violazione del vincolo di coerenza stato/collegamento, invece di
  degradare l'appuntamento a 'idea'. Verificato funzionalmente dal lead:
  ora la delete funziona e l'appuntamento degrada correttamente.

**UI aggiunta**: schermate Appuntamenti (segmented Confermati/Idee, grid
Pinterest per le idee, "Trasforma in appuntamento") e Wishlist (filtri
Regali/Attività/Tutto, archivio Completati separato, card sorpresa
mascherate) — sostituiscono i placeholder minimi di Fase 1. Wishlist legge
sempre da `wishlist_feed`, mai da `wishlist_items` direttamente.

**Notifiche push**: codice pronto (`supabase/functions/send-push/index.ts`,
`lib/push-actions.ts`, handler push/notificationclick in `public/sw.js`)
ma **Edge Function non deployata** — richiede un `supabase login`
interattivo via browser che nessun agente può fare da solo. Non blocca il
resto della Fase 2. Da fare quando l'utente ha un momento: generare le
chiavi VAPID (`npx web-push generate-vapid-keys`), impostare i secrets,
`supabase functions deploy send-push` (istruzioni complete nel commento in
testa al file).

**Bug reali trovati e corretti stanotte** (oltre al trigger sopra):
- Due stalli di agenti (`frontend2`, `qa2`, 600s senza progresso, watchdog
  non recuperato) — causa probabile un comando rimasto in foreground senza
  `run_in_background`. Risolti semplicemente rilanciando l'agente via
  `SendMessage` (riprende dal proprio transcript, nessun lavoro perso).
- Un bug reale in `WishlistView.complete()`: il messaggio d'errore veniva
  cancellato silenziosamente da una `load()` non attesa nello stesso batch
  React, prima che l'utente potesse vederlo. Trovato da un test di qa2
  scritto apposta per pinnare il comportamento, corretto da frontend2,
  test aggiornato di conseguenza.
- Un incidente di verifica: dopo un timeout del classificatore di
  sicurezza automatico su un turno di `backend2`, il lead ha ri-verificato
  di persona (`tsc`/`jest`/`git status`) prima di fidarsi del report —
  trovato un errore tsc transitorio (refactor a metà di `frontend2` in
  corso in parallelo, non un problema del lavoro di `backend2`), poi
  confermato risolto pochi minuti dopo.

**Non fatto stanotte, deliberatamente fuori scope**: test unitari per
`lib/push-actions.ts` (richiederebbe mock pesanti di
Notification/serviceWorker/PushManager per un pezzo non ancora deployato,
basso valore); deploy della Edge Function (vedi sopra).

## Verifica e2e reale (2026-09-01)

Progetto Supabase cloud creato dall'utente (piano free), migration
applicate a mano via SQL Editor (connessione diretta via CLI bloccata da
IPv6 non supportato dalla rete dell'utente — `db.<ref>.supabase.co` richiede
IPv6, vedi anche `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`/
`NEXT_PUBLIC_SUPABASE_ANON_KEY` del progetto, non committato). Email
confirmation disattivata su questo progetto per permettere login
immediato dopo signup nei test — **da riattivare se questo stesso progetto
viene mai usato con utenti veri**, non solo per test.

**Bug reali trovati e corretti eseguendo lo scenario e2e per la prima volta
contro Postgres vero** (nessuno di questi era visibile prima: in sandbox
senza Docker/Supabase non si era mai potuto testare oltre al typecheck):

1. **Mancava il GRANT di base su tutte e 5 le tabelle per il ruolo
   `authenticated`** (permission denied nonostante RLS corretta — le policy
   filtrano le righe ma non sostituiscono il privilegio di tabella di base
   richiesto da Postgres). Causa probabile: il progetto Supabase non ha
   ricevuto i grant di default che la piattaforma di solito applica in
   automatico alla creazione, forse per via delle migration incollate a
   mano invece che tramite `supabase db push`/CLI collegata. **Corretto in
   modo permanente**: nuova migration
   `supabase/migrations/20260901000000_grant_authenticated_table_privileges.sql`.
2. **Le 4 policy RLS di `calendar_events` (select/insert/update/delete)
   erano presenti nel file di migration ma non risultavano tutte create nel
   database** (verificato via `pg_policies`: solo 1 su 4). Causa: quasi
   certamente un troncamento nel copia-incolla di un blocco SQL lungo
   nell'SQL Editor del browser (stesso sintomo già visto con
   `accept_pairing_invite` prima in questa stessa sessione di setup) — **non
   un bug nel file di migration**, che era ed è corretto. Corretto
   ri-eseguendo le 4 `create policy` (con `drop policy if exists` prima, per
   idempotenza) direttamente nel progetto.
3. **Bug nel test e2e stesso** (non nell'app): selettore `getByRole("button",
   { name: "Genera codice" })` ambiguo — matcha sia il tab del segmented
   control sia il bottone reale dentro la card (stesso testo). Fix:
   `.last()` sul locator. Vedi commento nel file.
4. **Timeout di test troppo stretto**: il default Playwright di 30s non
   basta per un flusso con due signup reali + più round-trip RPC/RLS contro
   un progetto cloud (non locale). Alzato a 90s in `playwright.config.ts`.

**Lezione per il futuro**: dopo aver incollato SQL a mano nel dashboard
Supabase (invece che via `supabase db push` con CLI collegata), **verificare
sempre con una query di introspezione** (`select count(*) from pg_policies
where tablename = '...'`, o simile per funzioni/tabelle) che tutto sia
stato creato per intero — un "Success" nel banner della UI non garantisce
che l'intero blocco incollato sia stato eseguito senza troncamenti.

## Stato attuale

**Il progetto è stato spostato da `~/Desktop/couples-app` a
`~/Developer/couples-app`.** Motivo: `~/Desktop` è sincronizzata da iCloud
Drive ("Desktop & Documents"), e `node_modules` (centinaia di migliaia di
piccoli file) causava conflitti di sincronizzazione (`brctl status`
mostrava directory duplicate con suffisso " 2" dentro `node_modules` e voci
`pending-scan` bloccate) — quasi certamente la causa dell'interruzione
precedente della sessione. `~/Developer` non è sincronizzata da iCloud.
Verificato dopo lo spostamento: copia integrale confermata (rsync -av,
tutti i file sorgente presenti), `npm install` pulito in 6s (prima si
bloccava per minuti), `npx next build` compila con successo. **Se in
futuro si trova ancora il progetto sotto `~/Desktop`, è una copia
vecchia/parziale — usare sempre `~/Developer/couples-app`.** La vecchia
copia su Desktop non è stata cancellata (lasciata all'utente da rimuovere
quando conferma che va tutto bene).

Scaffold Next.js 16 + Tailwind v4 creato (`npx create-next-app`). Team di
agenti lanciato per la Fase 1 (MVP): **backend**, **frontend** e **QA**
hanno tutti completato i loro task, e il **pass e2e reale è stato eseguito
con successo** (2026-09-01, vedi "Verifica e2e reale" sopra) contro un
progetto Supabase cloud vero. **Fase 1 (MVP) è completa e verificata al
100%** — pronta per iniziare la Fase 2. Vedi sezione "Team di agenti" sotto
per il dettaglio del lavoro dei singoli agenti.

## Decisioni chiave già prese (non riaprire senza un motivo nuovo)

- **Piattaforma**: PWA (non app nativa), non store nativi.
- **Scope**: prodotto multi-coppia, non solo uso personale — serve
  autenticazione + pairing tra due account.
- **"Widget"**: dashboard in-app (Home), non un widget di sistema OS.
- **Stack**: Next.js + Supabase (Postgres, Auth, Realtime, Storage) + Vercel.
- **Calendario**: vista Giorno/Mese; appuntamenti confermati = stessa entità
  degli eventi calendario (non liste duplicate).
- **Eventi**: colore per categoria (personale/coppia/speciale/ciclo) + tag/
  descrizione libero separato dal colore (es. amici, uni, sport).
- **Privacy ciclo**: opt-in, non condiviso di default.
- **Wishlist regali**: modalità sorpresa — dettagli nascosti al destinatario
  finché non completato.
- **Nome cartella/repo**: `couples-app` (provvisorio — il nome pubblico
  dell'app non è ancora stato deciso).
- **Costi**: si parte su piani gratuiti Supabase/Vercel; upgrade solo se
  storage foto >1GB o se diventa prodotto commerciale (vedi PLAN.md).

## Cosa è fatto

- [x] Piano di design/UX/architettura completo e approvato dall'utente
- [x] Repo git inizializzato (ora in `~/Developer/couples-app`, vedi sopra
      — nessun commit ancora, file solo nel working tree)
- [x] `docs/PLAN.md` con il piano completo
- [x] Questo file di handoff
- [x] Scaffold Next.js 16 + Tailwind v4 + cartelle di dominio (app/,
      components/, lib/supabase/, supabase/, tests/, e2e/, types/)
- [x] **Backend — tutti i 6 task Fase 1**: migration SQL (profiles, couples,
      pairing_invites, calendar_events) con RLS, 2 RPC di pairing
      (create/accept_pairing_invite), realtime abilitato, client helpers
      (lib/supabase/client.ts, server.ts, middleware.ts), types/database.ts
      scritto a mano. `npx tsc --noEmit` passa su tutto il progetto.

**Aggiornamento 2026-09-01**: le migration/RLS/RPC **sono state validate
contro un Postgres reale** (progetto Supabase cloud, non locale — Docker
resta non disponibile in questo sandbox, ma non serve più: si può lavorare
contro il progetto cloud). Vedi "Verifica e2e reale" in cima al file per i
bug trovati durante questa validazione (tutti corretti).

## Cosa manca (in ordine)

- [x] **Fase 1 — MVP, COMPLETA E VERIFICATA E2E**: auth + pairing, calendario
      base (eventi personali/coppia, no ricorrenza), Home (100% dati reali,
      incluso "manda un pensiero"), installabilità PWA — vedi dettaglio
      completo nella voce `frontend` sotto "Team di agenti". Pass e2e reale
      a due account eseguito con successo il 2026-09-01 (vedi "Verifica e2e
      reale" in cima al file). **Niente resta aperto per la Fase 1.**
- [ ] **Fase 2**: Appuntamenti (confermati/idee) collegati al calendario,
      Wishlist con completamento/archivio, notifiche push base
- [ ] **Fase 3**: ricorrenze automatiche, calcolo buchi comuni, tracking
      ciclo con privacy+previsione, modalità sorpresa regali, messaggi
      programmati
- [ ] **Fase 4**: timeline fotografica, streak/countdown, temi colore
      personalizzabili, animazioni, pass finale QA + report

## Fase 2 — backend2: Appuntamenti, Wishlist, Notifiche push (stato)

Team di Fase 2 lanciato con `backend2`, `frontend2`, `qa2`. Questa sezione
copre il lavoro di `backend2` (il lead aggiornerà quando gli altri due
completano).

**Aggiornamento — le prime 3 migration sono LIVE**: main le ha applicate via
`supabase db push` con CLI collegata (pooler, non SQL Editor via browser —
niente rischio di troncamento questa volta) e ha eseguito un test funzionale
end-to-end reale con due account sulla modalità sorpresa: il creatore vede
tutto, il destinatario riceve `[]` da una query diretta su `wishlist_items`,
vede il placeholder mascherato su `wishlist_feed` (5 campi null,
`is_hidden_surprise: true`), non può UPDATE/DELETE la riga nascosta, e dopo
il completamento la vede rivelata su `wishlist_feed` — la difesa a due
livelli funziona esattamente come da design. `appointments` e
`wishlist_items`/`wishlist_feed` sono quindi **live e utilizzabili**, vedi
`⚠️ una quarta migration di fix sotto` per un dettaglio importante prima di
usare la funzione "Trasforma in appuntamento" in produzione.

- `supabase/migrations/20260901010000_appointments.sql` — LIVE.
- `supabase/migrations/20260901020000_wishlist_items.sql` — LIVE.
- `supabase/migrations/20260901030000_push_subscriptions.sql` — LIVE.
- `supabase/migrations/20260901040000_appointments_status_sync_trigger.sql`
  — **LIVE, verificata funzionalmente da main**: bug reale trovato da
  backend2 in autorevisione DOPO che main aveva già applicato le prime 3
  (per questo è un file separato, non un edit del file originale — stesso
  approccio già visto in Fase 1 col fix dei GRANT): `appointments.
  calendar_event_id` ha `on delete set null`, ma il vincolo
  `appointments_status_calendar_event_consistency` impone che
  `status='confermato' <=> calendar_event_id is not null`. Senza un trigger
  che tenga sincronizzati i due campi, cancellare un `calendar_event`
  collegato a un appuntamento confermato avrebbe fatto fallire l'intera
  DELETE con una violazione di vincolo (la FK action mette
  `calendar_event_id = NULL` ma non tocca `status`, che resta 'confermato' —
  incoerente). Fix: trigger BEFORE UPDATE che forza `status = 'idea'` quando
  `calendar_event_id` diventa NULL, qualunque sia la causa. Main l'ha
  applicata e verificata con un test funzionale reale: creato un
  appuntamento confermato, cancellato il calendar_event collegato,
  confermato che l'appuntamento degrada correttamente a `status='idea'`/
  `calendar_event_id=null` invece di far fallire la DELETE. **Tutte e 4 le
  migration di backend2 sono ora live e verificate — nessun percorso resta
  rischioso, incluso cancellare un calendar_event collegato a un
  appuntamento confermato.**

**Integrazione lato frontend2**: `AppointmentsView`/`AppointmentFormModal` e
`WishlistView` collegati ai dati reali (niente più mock). Aggiunta su
richiesta di frontend2 la funzione `createConfirmedAppointment(input,
eventInput)` in `lib/appointments-actions.ts`: crea un appuntamento
CONFERMATO direttamente (FAB "nuovo appuntamento", mai stato un'idea) con
un solo INSERT su `appointments` già a `status='confermato'` +
`calendar_event_id` (invece di comporre `createAppointmentIdea` +
`confirmAppointment`, che restano corrette e in uso per il flusso "idea
esistente -> trasforma in appuntamento"). Nota per qa2: il path "nuovo
confermato dal FAB" via `createConfirmedAppointment` non ha ancora test
dedicati (gap di copertura segnalato da frontend2, non bloccante).

Dettaglio per il contesto (migration originali, testo invariato):

- `supabase/migrations/20260901010000_appointments.sql` — tabella
  `appointments` (idee + confermati). Colonne: `title`, `location`, `cost`,
  `notes`, `photo_url`, `tag` (libero, come `calendar_events.tag`), `status`
  (`'idea' | 'confermato'`), `calendar_event_id` (nullable, unique, FK a
  `calendar_events` con `on delete set null`). Vincolo DB
  `appointments_status_calendar_event_consistency`: `status = 'confermato'`
  se e solo se `calendar_event_id is not null` — impossibile avere uno stato
  incoerente anche con un client bacato. **Decisione RLS**: appuntamento =
  piano di coppia per natura, stesso pattern di `calendar_events` categoria
  `'coppia'` → entrambi i partner possono SELECT/UPDATE/DELETE qualunque
  appuntamento della coppia (non solo il proprio); a differenza di
  `calendar_events` qui non serve nemmeno distinguere per categoria.
  "Trasforma in appuntamento": NESSUNA RPC — due scritture client-side
  separate (insert `calendar_events`, poi update `appointments` con
  `calendar_event_id`), vedi `confirmAppointment()` in
  `lib/appointments-actions.ts` (con rollback best-effort del
  `calendar_event` se il secondo passo fallisce).

- `supabase/migrations/20260901020000_wishlist_items.sql` — tabella
  `wishlist_items` + view `wishlist_feed`. Colonne tabella: `category`
  (`'regalo'|'attivita'`), `target` (`'self'|'partner'|'entrambi'`), `title`,
  `description`, `price`, `link`, `photo_url`, `priority`
  (`'bassa'|'media'|'alta'`, default `'media'`), `is_surprise`, `status`
  (`'attivo'|'completato'`), `completed_at`, `completed_by` (aggiunto per
  giudizio, non nel piano esplicitamente). **MAI delete secco imposto anche
  a livello DB**, non solo convenzione UI: nessuna policy/grant DELETE su
  questa tabella per `authenticated` — l'unico modo di archiviare un item è
  `status = 'completato'`.

  **Modalità sorpresa — il punto delicato del task, letto con attenzione**:
  soluzione a DUE livelli (difesa in profondità):
  1. La RLS SELECT della tabella BASE nega del tutto la riga a chi non è il
     creatore quando `is_surprise AND status='attivo' AND created_by <>
     auth.uid()` — una query diretta su `wishlist_items` non riceve
     letteralmente quella riga.
  2. La VIEW `public.wishlist_feed` (creata con `security_invoker = false`,
     quindi esegue con il contesto/permessi del proprietario della vista, che
     possiede anche `wishlist_items` e quindi bypassa la RLS di quella
     tabella — il `where couple_id = current_couple_id()` scritto a mano
     nella vista sostituisce la RLS, non la integra: è obbligatorio, non
     opzionale) espone TUTTE le righe della coppia (comprese quelle
     sorpresa-attive-non-tue) ma con `title`, `description`, `price`, `link`,
     `photo_url` forzati a `null` per quelle righe, più un flag
     `is_hidden_surprise: boolean`. **Il frontend deve leggere questa view
     (`listWishlistFeed()` in `lib/wishlist-actions.ts`) per la lista
     condivisa, mai la tabella base direttamente** — altrimenti le sorprese
     in arrivo spariscono invece di mostrare un placeholder "🎁 sorpresa in
     arrivo". Le scritture (create/update/complete) restano sempre sulla
     tabella base. Commento esteso con l'analisi completa (perché RLS a
     colonna non esiste, le due alternative valutate, come funziona
     tecnicamente l'ownership della view) in testa al file di migration —
     leggerlo per intero prima di modificare RLS/view qui.

- `supabase/migrations/20260901030000_push_subscriptions.sql` — tabella
  `push_subscriptions` (endpoint/p256dh/auth_key/user_id), RLS solo proprie
  righe (select/insert/update/delete). La lettura delle sottoscrizioni del
  PARTNER (per inviargli una push) passa dalla Edge Function con service
  role, non da RLS lato tabella.

- `supabase/functions/send-push/index.ts` — Edge Function pronta, **NON
  deployata** (richiede `supabase login` interattivo via browser, che
  backend2 non può eseguire in questo ambiente sandbox — non un blocco per
  il resto della Fase 2). Verifica identità chiamante + appartenenza alla
  stessa coppia del destinatario con un client "per-utente" (rispetta RLS),
  poi usa service role solo per leggere le `push_subscriptions` del
  destinatario e inviare via `web-push` (npm specifier Deno). Pulisce le
  sottoscrizioni scadute (404/410) automaticamente. Istruzioni complete per
  generare le chiavi VAPID (`npx web-push generate-vapid-keys`), impostarle
  come secrets e fare il deploy sono nel commento in testa al file — da
  seguire quando l'utente farà login CLI di persona.
  `public/sw.js` ha già gli handler `push`/`notificationclick` (mostrano la
  notifica, aprono/focussano l'app al tap) — funzionano da subito una volta
  che la function invierà davvero qualcosa, nessuna modifica necessaria al
  deploy. `lib/push-actions.ts`: `subscribeToPush()` / `unsubscribeFromPush()`
  (upsert/delete su `push_subscriptions`, richiede
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `.env.local` una volta generate le
  chiavi) e `sendPushToPartner()` (invoca la Edge Function — non chiamarla da
  UI finché il deploy non è confermato).

**Codice client pronto, compila pulito** (`npx tsc --noEmit` pulito su tutti
i file di backend2 — gli unici errori tsc rimasti in questo momento sono in
file WIP di `frontend2`, componenti mock non ancora allineati ai nomi enum
definitivi, non causati da backend2, vedi messaggio a `frontend2`):
`lib/appointments-actions.ts`, `lib/wishlist-actions.ts`,
`lib/push-actions.ts`, `types/database.ts` aggiornato (nuovi enum, tabelle
`appointments`/`wishlist_items`/`push_subscriptions`, view `wishlist_feed`).
`tsconfig.json` aggiornato per escludere `supabase/functions` (runtime Deno,
non Node — stesso motivo per cui non è mai stato nel progetto TS Next.js).

**Nessuna di queste tabelle è "live"** finché main non conferma
`supabase db push` (o incolla a mano in SQL Editor **verificando con
`pg_policies`/introspezione che tutte le policy siano state create per
intero**, vedi bug reale già trovato in Fase 1 in cima a questo file — non
ripeterlo). `lib/appointments-actions.ts`/`lib/wishlist-actions.ts`/
`lib/push-actions.ts` compilano ma ogni chiamata fallirà contro un progetto
reale finché non sono live.

## Team di agenti

Team di 3 agenti in-process lanciato nella sessione del 2026-08-31 (nomi:
`frontend`, `backend`, `qa`). **Confermato**: i compagni di team in-process
non sono sopravvissuti all'interruzione (problema iCloud, vedi sopra) — al
resume erano spariti, come atteso. Rilanciati come team di 2 (`frontend`,
`qa`) visto che backend è completo; il lead copre eventuale follow-up
backend residuo.

- **backend**: ✅ completato — vedi "Cosa è fatto" sopra per il dettaglio e
  il limite Docker. Decisioni di schema fatte per giudizio (non scritte
  esplicitamente in PLAN.md, approvate dal lead): eventi 'personale'
  visibili al partner col colore del creatore (serve ai futuri "buchi
  comuni"); eventi 'coppia' modificabili/eliminabili da entrambi i partner;
  un solo invito di pairing "pending" attivo per utente. `middleware.ts`
  alla radice verificato presente e corretto (chiama `updateSession` da
  `lib/supabase/middleware.ts`) — gap chiuso.
- **frontend**: ✅ completato (MVP Fase 1). Consegnato:
  - **Design tokens**: già presenti in `app/globals.css` da una sessione
    precedente (palette, radius, shadow, font Nunito), riverificati e usati
    ovunque — nessuna modifica necessaria.
  - **App shell**: `app/(app)/layout.tsx` fa da guard (redirect `/login` se
    non loggato, `/pairing` se non accoppiato) e monta `components/
    AppTabBar.tsx` (5 tab: Home/Calendario/Appuntamenti/Wishlist/Profilo,
    icone SVG line-style inline, nessuna nuova dipendenza).
  - **Onboarding/Auth**: `app/(auth)/login` (`components/auth/LoginForm.tsx`,
    toggle login/signup) e `app/(auth)/pairing` (`components/auth/
    PairingClient.tsx`, genera/accetta codice) — entrambi collegati alle
    server actions reali in `lib/auth-actions.ts`. `app/page.tsx` fa da
    router puro (`/` → `/login` \| `/pairing` \| `/home` in base a sessione/
    `couple_id`).
  - **Home**: `app/(app)/home/page.tsx` (server component, dati reali:
    profilo/partner/couple via nuovo `lib/current-couple.ts`, prossimi 3
    eventi e prossima data speciale — con calcolo ricorrenza annuale — via
    query reali su `calendar_events`). Card "Pensiero del giorno" + FAB
    "manda un pensiero" (`components/home/ThoughtsSection.tsx`) **ora
    collegate alla tabella reale `messages`** via il nuovo `lib/
    messages-actions.ts` (aggiunto dal lead per chiudere il gap 1, vedi
    sotto): fetch iniziale con `listRecentThoughts()` in un `useEffect`,
    invio con `sendThought()`, reazione a cuore con `toggleThoughtReaction()`
    (ottimistica, con rollback se la RPC fallisce). Distingue "Tu" dal
    partner confrontando `senderId` col nuovo prop `selfId` passato da
    `home/page.tsx`. Foto e anteprima wishlist restano mock (storage/tabella
    non ancora pronti, coerente col task originale — non un gap urgente).
  - **Calendario**: `components/calendar/CalendarView.tsx` (+ `DayAgendaSheet`,
    `EventFormModal`) — toggle Giorno/Mese, griglia mese con puntini colorati
    per categoria (max 3 + "+n"), bottom sheet agenda al tap su un giorno,
    timeline oraria in vista Giorno, FAB "+" per creare eventi
    (personale/coppia/speciale, tag libero con chip suggerite, tutto il
    giorno o orario, note) — **dati reali** letti/scritti su
    `calendar_events` (RLS rispettata: insert solo a proprio nome). Niente
    ricorrenza né "buchi comuni" né categoria "ciclo" in UI: esplicitamente
    fuori scope Fase 1 per roadmap (Fase 3).
  - **Profilo**: placeholder funzionale (non solo statico) — dati account
    reali, avatar colorato, dati partner, data inizio relazione (sola
    lettura, vedi gap sotto), pulsante Esci reale.
  - **Appuntamenti/Wishlist**: placeholder minimi (`components/ui/
    PlaceholderScreen.tsx`) come da scope Fase 1.
  - **PWA**: manifest e service worker già presenti, riverificati funzionanti
    con `npx next build && npx next start` (manifest/sw serviti 200, icone
    valide) — vedi verifica sotto.
  - **Verifica fatta**: `npx tsc --noEmit` pulito, `npx next build` pulito,
    `npx jest` verde (46/46, riverificato pulito anche dopo lo swap
    messaggi). Visiva: screenshot
    via Playwright (Chromium headless, già in cache) di login/signup (con
    `.env.local` placeholder locale, rimosso a fine sessione — non
    committato, `.env*` è gitignored) e, tramite una route temporanea poi
    cancellata, di tutte le card Home + Calendario mese/giorno + modale
    creazione evento: rendering coerente col design system, nessun problema
    visivo. Le rotte autenticate reali (`/home`, `/calendario`, ecc.) non
    sono testabili end-to-end in questo sandbox per lo stesso limite Docker/
    Supabase già noto dal lato backend — il guard di sessione è comunque
    verificato: senza sessione ogni rotta protetta redirige correttamente a
    `/login` (200 dopo redirect, confermato via curl).
  - **Gap scoperti, segnalati al lead (non improvvisati)**:
    1. ✅ **Chiuso dal lead**: mancava la tabella `messages` (testo/foto/
       reminder, `scheduled_for`) descritta in `docs/PLAN.md` → "Modello
       dati principale". Il lead l'ha aggiunta (vedi voce `lead` sotto) e
       frontend ha fatto lo swap di `ThoughtsSection.tsx` allo stato reale
       — Home è ora al 100% su dati reali tranne foto/wishlist (mock per
       scelta, non per gap).
    2. **`couples` non ha nessuna policy UPDATE** per `authenticated` (per
       design, vedi commenti in `supabase/migrations/
       20260831120000_core_schema.sql`): significa che
       `relationship_start_date` non è impostabile dal client con lo schema
       attuale. Non blocca l'MVP (Profilo è placeholder), ma va risolto
       (nuova RPC tipo `accept_pairing_invite`, o una policy UPDATE mirata)
       prima delle impostazioni di Profilo in Fase 2.
    3. **Nessuna colonna "reminder"** su `calendar_events` (il piano
       menziona "promemoria on/off" nel FAB di creazione evento): il form
       di creazione eventi non espone questo campo per coerenza con lo
       schema reale. Da aggiungere insieme alle notifiche push di Fase 2.
    4. Minore: `next build` mostra un warning di deprecazione su
       `middleware.ts` ("use proxy instead", Next 16) — non bloccante, file
       di scope backend, non toccato.
- **lead (io, follow-up backend sui gap 1 e 2 segnalati da frontend)**:
  ✅ completati, senza improvvisare — schema/pattern coerenti con quelli già
  esistenti (RPC SECURITY DEFINER invece di policy UPDATE dirette, stesso
  ragionamento di `accept_pairing_invite`):
  - **Tabella `messages`** aggiunta (`supabase/migrations/
    20260831190000_messages.sql`): `type` (text/photo/reminder), `content`,
    `photo_url` (per Fase 2, storage non ancora configurato), `scheduled_for`
    (per Fase 3, non usato ora), `liked_by uuid[]` per la reazione a cuore.
    RLS: select/insert/delete per membri della coppia (insert solo a proprio
    nome), nessuna policy UPDATE — la reazione a cuore passa dalla nuova RPC
    `toggle_message_reaction` (SECURITY DEFINER) per evitare che il client
    possa alterare `content` mascherandolo da reazione. Realtime abilitato
    (stesso motivo delle altre tabelle: Home deve aggiornarsi live).
    `types/database.ts` aggiornato. Nuovo `lib/messages-actions.ts`
    (`listRecentThoughts`, `sendThought`, `toggleThoughtReaction`) con lo
    stesso pattern client-side di `lib/auth-actions.ts`. ✅ **Swap lato
    frontend completato**: `ThoughtsSection.tsx` ora chiama
    `listRecentThoughts`/`sendThought`/`toggleThoughtReaction` invece dello
    stato locale mock (vedi voce `frontend` sopra). `npx tsc --noEmit` e
    `npx jest` riverificati puliti dopo lo swap.
  - **RPC `set_relationship_start_date(p_date)`** aggiunta (`supabase/
    migrations/20260831190100_couples_relationship_start_date_rpc.sql`):
    imposta `couples.relationship_start_date` per la coppia dell'utente
    autenticato. `types/database.ts` aggiornato. Non ancora chiamata da
    nessuna UI (Profilo è placeholder in Fase 1) — pronta per Fase 2.
  - **Gap 3 (colonna `reminder` su `calendar_events`) lasciato aperto
    volutamente**: senza le notifiche push di Fase 2 un toggle "promemoria"
    non farebbe nulla di utile, va fatto insieme a quel lavoro, non prima.
  - **Bug lint segnalato da qa**: non ancora sistemato, in attesa di
    conferma dall'utente se procedere ora o rimandare (non è tra i criteri
    di fine Fase 1 di PLAN.md).
  - `npx tsc --noEmit` verificato pulito su tutto il progetto dopo queste
    modifiche. Migration non ancora eseguite su un Postgres reale (stesso
    limite Docker di tutte le altre).
- **qa**: ✅ completato (Fase 1), **incluso il pass e2e reale** (eseguito
  dal lead il 2026-09-01 contro Supabase cloud, vedi "Verifica e2e reale"
  in cima al file — 3 bug reali trovati e corretti in quel passaggio, non
  nel lavoro di qa qui sotto, che restava corretto).
  - ✅ **Bug di tipi in `tests/lib/auth-actions.test.ts` risolto.** Causa:
    `jest.fn()` senza generico produce `Mock<UnknownFunction>`, la cui
    `ReturnType` non è una `Promise<...>` — `mockResolvedValue`/
    `mockRejectedValue` derivano il tipo atteso da quella `ReturnType`
    (`ResolveType`/`RejectType` in `jest-mock`), quindi collassa sempre a
    `never`. Fix: ogni `jest.fn<...>()` ora ha la firma reale della
    funzione/metodo che mocka (niente `any`/`@ts-ignore`, tsconfig
    invariato). Aggiunto anche `makeQueryBuilderMock()`, helper tipizzato
    riusabile per la catena `.from(table).select().eq().maybeSingle()`.
    `npx tsc --noEmit` ora è **pulito su tutto il progetto** (0 errori).
  - ✅ **Bug runtime scoperto durante la verifica (mascherato finora dal
    fallimento di tsc)**: con `import { jest } from "@jest/globals"`, sotto
    il transform SWC di `next/jest` la chiamata `jest.mock(...)` non veniva
    hoistata sopra gli `import` sottostanti (verificato con un file di
    repro isolato) — il modulo reale `@/lib/supabase/client` veniva quindi
    caricato invece del mock e **tutti i 13 test del file fallivano a
    runtime** ("Your project's URL and API key are required..."),
    indipendentemente dal typecheck. Fix: passato al pattern `jest` globale
    ambient (stesso già usato correttamente in
    `tests/setup.smoke.test.tsx`) invece di importarlo da `@jest/globals`.
    **Convenzione da seguire per i prossimi test con `jest.mock`**: usare
    sempre il `jest` globale ambient, mai l'import da `@jest/globals`,
    altrimenti il mock non viene applicato. Segnalato a frontend.
  - ✅ **Estesi i test unitari** per la logica non banale già disponibile
    (frontend ha nel frattempo consegnato calendario + Home base):
    - `tests/lib/current-couple.test.ts` — `lib/current-couple.ts`
      (`getCurrentCoupleData`, server-side): null se non loggato, null se
      profilo mancante, partner/couple null se non accoppiato, risoluzione
      corretta del partner (partner_1 vs partner_2), degrado a
      couple/partner null se la riga `couples` non si trova.
    - `tests/lib/calendar-dates.test.ts` — `lib/calendar-dates.ts`: griglia
      mese (6×7, lunedì-first, code mesi adiacenti, sequenza continua),
      `addDays`/`addMonths` (incl. overflow fine mese, es. 31 gen + 1 mese),
      `daysBetween` (a giorni di calendario, non ms grezzi), `toDateKey`
      locale (non UTC), `nextOccurrence` per ricorrenze annuali (salto
      d'anno se già passata, boundary esatto sul giorno stesso).
    - `tests/lib/calendar-colors.test.ts` — `lib/calendar-colors.ts`
      (`eventColor`): colori fissi per coppia/speciale/ciclo, colore
      self/partner per eventi personali, fallback quando `partnerColor`/
      `partnerId` sono null.
    - Estratto `tests/helpers/supabase-query-mock.ts` (helper `makeQueryBuilderMock`
      condiviso, tipizzato) per non duplicare il mock della catena
      `.from().select().eq().maybeSingle()` tra i file di test — usato ora
      sia da `auth-actions.test.ts` che da `current-couple.test.ts`.
  - ✅ **Test per il gap 1 chiuso** (tabella `messages` + swap di
    `ThoughtsSection.tsx` segnalati da frontend/lead, vedi sopra):
    - `tests/lib/messages-actions.test.ts` — `lib/messages-actions.ts`
      (`listRecentThoughts`/`sendThought`/`toggleThoughtReaction`): stesso
      pattern di `auth-actions.test.ts` (client Supabase mockato,
      tipizzato). Copre: utente non autenticato, mapping riga→`Thought`
      (join `profiles` per `senderName`, fallback "Partner" se null,
      `likedByMe` da `liked_by`), propagazione errori query/insert/RPC,
      validazione contenuto vuoto, `couple_id` null → errore.
    - `tests/components/home/ThoughtsSection.test.tsx` — primo test a
      livello componente (React Testing Library + `@testing-library/
      user-event`), `lib/messages-actions` mockato. Copre la logica non
      banale del componente: reazione a cuore ottimistica con conferma o
      **rollback** se la RPC fallisce (Promise risolta a mano nel test per
      evitare una race — `userEvent.click` flush-a i microtask pendenti,
      quindi con un mock già risolto l'update ottimistico e la conferma
      finale sono indistinguibili), "Tu" vs nome partner in base a
      `selfId`, invio di un pensiero che lo prepende alla lista e chiude il
      compose.
  - ✅ **Scenario e2e di fine Fase 1 preparato** (richiesto da PLAN.md,
    sezione "Verifica"): `e2e/pairing-calendar.spec.ts` — due `BrowserContext`
    separati (due account/sessioni reali, non due tab): A si registra, genera
    un codice di pairing, B si registra e lo accetta, A crea un evento
    categoria "coppia" sul calendario, B (account distinto) verifica di
    vederlo con lo stesso colore (RLS + `eventColor()` coerenti tra i due
    account). Selettori verificati a mano contro il markup reale di
    `LoginForm`/`PairingClient`/`EventFormModal`/`CalendarView` (nessuna
    congettura). **Pending, non silenziosamente skippato**: `test.skip(...)`
    con motivazione esplicita nel report, gated da `E2E_SUPABASE_READY=1`
    (non serve toccare il file quando l'ambiente sarà pronto).
    - ⚠️ **Scoperta più precisa del limite Docker per l'e2e**: in questo
      sandbox **nessun test Playwright può girare affatto**, nemmeno
      `e2e/setup.smoke.spec.ts` già esistente — non solo per Docker/
      `supabase start`, ma perché non esiste **nessuna** variabile
      `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` nell'ambiente
      (nessun `.env.local`): il `middleware.ts` alla radice chiama
      `updateSession` su *ogni* richiesta e va in errore prima ancora che
      Playwright riesca a fare l'health-check del suo `webServer` (timeout
      60s, verificato). Coerente con quanto notato da frontend (ha dovuto
      usare un `.env.local` placeholder locale, rimosso a fine sessione, per
      i suoi screenshot manuali). Un placeholder basterebbe a sbloccare il
      solo smoke test (nessuna vera chiamata Supabase), ma lo scenario
      due-account richiede comunque un'istanza Supabase reale e funzionante.
  - Stato ora: `npx tsc --noEmit` pulito, `npx jest` verde — **7 suite, 62
    test**. Home ora ha copertura di test end-to-end della sua logica non
    banale (countdown/date già coperte via `calendar-dates.test.ts`,
    messaggi via i due file sopra). Il pass e2e reale (`e2e/pairing-calendar.spec.ts`)
    è stato eseguito con successo dal lead il 2026-09-01 (vedi "Verifica e2e
    reale" in cima al file) — **Fase 1 coperta lato QA al 100%**. Prossimo:
    eventuali test per Appuntamenti/Wishlist quando usciranno dai
    placeholder (Fase 2, fuori scope Fase 1).
  - ⚠️ **Bug ambientale trovato, non causato da queste modifiche**: `npm
    run lint` / `npx eslint` è rotto a livello di progetto — `TypeError:
    Converting circular structure to JSON` durante il resolve di
    `next/core-web-vitals` via `FlatCompat` con eslint 9.39.5 (riproducibile
    su qualsiasi file, es. `npx eslint app/page.tsx`). Non bloccante per
    tsc/jest, ma da sistemare prima di poter contare su un lint verde come
    criterio di fine fase. Segnalato al lead.

## Fase 2 — stato team (2026-09-01, in corso)

Team di 2 agenti in-process lanciato per la Fase 2: **backend2**
(tabelle/azioni appointments/wishlist/push) e **frontend2** (UI
Appuntamenti/Wishlist), coordinati da **qa2** (test, questo agente).

- **qa2**: ✅ copertura unitaria Fase 2 completa per tutto ciò che
  backend2/frontend2 hanno consegnato finora. Partito leggendo HANDOFF.md/
  PLAN.md e il pattern di test di Fase 1 (`tests/lib/messages-actions.test.ts`,
  `tests/lib/current-couple.test.ts`, `tests/helpers/supabase-query-mock.ts`,
  `tests/components/home/ThoughtsSection.test.tsx`). Chiesto a backend2 il
  meccanismo esatto della modalità sorpresa (RLS + view `wishlist_feed`)
  prima di scrivere test, per non indovinare la forma dei dati — risposta
  ricevuta e usata come base per i test.
  - `tests/lib/appointments-actions.test.ts` (17 test): `listAppointments`,
    `createAppointmentIdea` (titolo vuoto, non autenticato, non accoppiato,
    insert+mapping, propagazione errore), `confirmAppointment` (non
    autenticato/non accoppiato, creazione `calendar_event` + update
    `appointments`, propagazione errore su insert evento SENZA tentare
    l'update, e il **rollback best-effort** del `calendar_event` se il
    secondo update fallisce — verificato che l'errore riportato sia quello
    originale, non un eventuale errore del rollback), `updateAppointment`,
    `deleteAppointment`.
  - `tests/lib/wishlist-actions.test.ts` (22 test), focus sulla modalità
    sorpresa (il punto più delicato della fase): `listWishlistFeed` legge
    sempre da `wishlist_feed` (mai `wishlist_items` diretta) e mappa fedelmente
    i 4 casi — riga visibile normale, destinatario con sorpresa attiva
    (`isHiddenSurprise=true`, 5 campi sensibili null, category/target/
    priority/status comunque visibili), creatore della propria sorpresa
    (`isHiddenSurprise=false` anche con `is_surprise=true`), sorpresa
    completata (torna piena per entrambi). Testato anche il vincolo lato
    client di `createWishlistItem` (`isSurprise`+`target='self'` rifiutato
    senza chiamare Supabase; `target='entrambi'` invece permesso, coerente col
    vincolo DB reale) e che il modulo NON esporti `deleteWishlistItem` ("mai
    delete secco" per design).
  - `tests/components/appointments/AppointmentsView.test.tsx` (5 test):
    countdown sui confermati letto dal `calendar_event` collegato (non da un
    campo data locale — `appointments` non duplica data/ora), caso "senza
    data" per un `calendar_event_id` non risolto, la lookup `calendar_events`
    NON viene chiamata se non ci sono confermati da risolvere, e l'intera
    transizione "Trasforma in appuntamento" (apertura form precompilato →
    `updateAppointment` chiamato PRIMA di `confirmAppointment` con
    `category: 'coppia'` → reload → l'item ricompare sotto "Confermati"),
    incluso il caso di errore (il form resta aperto con il messaggio,
    non si chiude silenziosamente).
  - `tests/components/wishlist/WishlistView.test.tsx` (9 test): filtri
    Regali/Attività di coppia/Tutto, toggle archivio Completati, e la stessa
    matrice di visibilità sorpresa testata a livello UI (destinatario vede
    SOLO il placeholder "Sorpresa in arrivo…" senza fughe di titolo/prezzo e
    senza pulsante di completamento; creatore vede tutto + badge 🎁; dopo il
    completamento il destinatario vede tutto), più il completamento
    ottimistico con rollback via refetch in caso di errore.
    - **Bug reale trovato e segnalato**: il primo giro di test ha scoperto che
      il messaggio d'errore di `complete()` non arrivava mai a schermo — il
      `setError(result.error)` veniva chiamato prima di un `load()` non
      atteso, e `load()` fa `setError(null)` in modo sincrono a inizio fetch,
      cancellando l'errore nello stesso batch React prima che l'utente potesse
      vederlo. **Corretto da frontend2 in giornata** (`await load()` prima di
      impostare l'errore, così è l'ultima scrittura e resta visibile) — test
      aggiornato di conseguenza, ora verifica che il messaggio persista.
  - **Gap di copertura chiuso**: backend2 ha aggiunto `createConfirmedAppointment()`
    a `lib/appointments-actions.ts` (un solo INSERT per il FAB "nuovo
    appuntamento confermato dal FAB, mai stato un'idea" — prima componeva
    `createAppointmentIdea`+`confirmAppointment`, funzionante ma con uno
    stato 'idea' intermedio inutile e un evento Realtime in più) e frontend2
    ha fatto lo swap in `AppointmentFormModal.tsx`; segnalato a qa2 come gap
    di copertura. Aggiunti 6 test in `tests/lib/appointments-actions.test.ts`
    (stesso pattern di `confirmAppointment`: titolo vuoto, non autenticato,
    non accoppiato, insert calendar_event+appointments con UN SOLO insert,
    propagazione errore su calendar_event senza tentare l'insert su
    appointments, rollback best-effort se l'insert su appointments fallisce).
  - **`e2e/wishlist-surprise.spec.ts` scritto** (nuovo, pending come
    `pairing-calendar.spec.ts` — gated da `E2E_SUPABASE_READY=1`, nessuna
    istanza Supabase raggiungibile in questo sandbox): due `BrowserContext`
    separati, A e B si accoppiano, A crea un regalo "per il partner" in
    modalità sorpresa e lo vede subito pieno, B apre la propria Wishlist e
    vede SOLO il placeholder "Sorpresa in arrivo…" (assert esplicito che il
    titolo reale non compaia MAI nel DOM di B, e che B non abbia il pulsante
    "Segna come completato" — coerente con la RLS), A completa l'item, B
    (dopo un refresh — `WishlistView` non ha listener Realtime, comportamento
    atteso non un limite del test) vede finalmente i dettagli reali.
    Struttura concordata con backend2 via messaggio prima di scriverlo.
    Selettori verificati a mano contro il markup reale di
    `WishlistFormModal`/`WishlistView` (nessuna congettura). Verificato con
    `npx playwright test --list` (parsing/compilazione ok, non eseguibile
    qui). Il trigger `appointments_status_sync_trigger` (sync su delete
    calendar_event collegato) è stato deliberatamente lasciato FUORI da
    questo scenario su indicazione di backend2 (nessun percorso UI dedicato
    ancora in frontend2; già verificato funzionalmente da main via query
    dirette) — da riconsiderare come scenario e2e separato se/quando esiste
    un bottone "elimina" sull'evento calendario collegato.
  - Stato finale: `npx tsc --noEmit` pulito, `npx jest` verde — **11 suite,
    121 test** (45 lib + 14 componenti aggiunti da qa2 in Fase 2, invariato
    il resto). Verificato stabile su run ripetuti (nessuna flakiness
    residua). Più `e2e/wishlist-surprise.spec.ts` (pending, vedi sopra).
  - Non ancora fatto: nessun pass e2e REALE eseguito (nessuno dei due
    scenari e2e, né quello di Fase 1 né il nuovo, è stato girato contro un
    Supabase vero in questa sessione — servono le credenziali del progetto
    cloud, che qa2 non ha; entrambi restano "pending" pronti per quando main
    li esegue, stesso schema già usato a fine Fase 1). Nessun test per
    `lib/push-actions.ts` (non richiesto esplicitamente dal brief;
    richiederebbe mock pesanti di `Notification`/`navigator.serviceWorker`/
    `PushManager`, non ancora fatto). Nessuna credenziale Supabase
    disponibile lato qa2: per sapere se una tabella è "live" ci si è sempre
    appoggiati a conferme esplicite di
    backend2/main, mai assunto.
- **frontend2**: ✅ schermate Appuntamenti e Wishlist costruite, **poi
  collegate a dati reali** una volta che main ha applicato le migration e
  backend2 ha confermato "live" (stessa sessione). Letti prima di scrivere
  codice: `HANDOFF.md`, `docs/PLAN.md` (sezioni Appuntamenti/Wishlist/Design
  system), `components/calendar/CalendarView.tsx`+`EventFormModal.tsx`+
  `DayAgendaSheet.tsx`, `components/home/ThoughtsSection.tsx`,
  `components/ui/*`, `app/(app)/layout.tsx`.
  - **Fase 1 (mock)**: prima UI costruita con dati mock in `app/_data/mock.ts`
    (stesso pattern di `ThoughtsSection.tsx` prima dello swap in Fase 1),
    verificata via screenshot Playwright su una route temporanea
    (`app/dev-preview-f2/...`, creata e cancellata a fine di quella fase).
    Coordinamento con backend2 via messaggio prima di scrivere UI (forma
    esatta di `appointments`/`wishlist_items`, meccanismo sorpresa, se
    "transform" fosse RPC singola o due chiamate) — backend2 ha risposto
    consegnando direttamente migration + `types/database.ts` +
    `lib/appointments-actions.ts`/`lib/wishlist-actions.ts` già scritti e
    tipizzati. Riletti quei file invece di aspettare solo la risposta
    testuale, e riallineati i valori enum della UI mock a quelli reali
    (`status` appuntamenti `'idea'|'confermato'` non `'confirmed'`, wishlist
    `'attivo'|'completato'` non `'active'/'completed'`, `tag` appuntamenti
    testo libero non enum chiuso).
  - **Swap a dati reali** (stesso giorno, dopo conferma "live" da main):
    rimosso `app/_data/mock.ts` (sezioni Appuntamenti/Wishlist, righe morte
    — `mockWishlistPreview` per la card di anteprima Home resta, quella non
    è stata toccata).
    - **Appuntamenti** (`app/(app)/appuntamenti/page.tsx` — nessun fetch
      qui, il guard è già nel layout — → `components/appointments/
      AppointmentsView.tsx` + `AppointmentFormModal.tsx`): segmented control
      Confermati/Idee, dati da `listAppointments()`
      (`lib/appointments-actions.ts`). La tabella `appointments` NON ha
      data/ora (vive sul `calendar_event` collegato): per i confermati la
      view fa un secondo giro con `supabase.from("calendar_events").select(...).in("id", ids)`
      sugli id raccolti da `calendar_event_id`, stesso client browser di
      `CalendarView.tsx`. Card confermati ordinate per data
      (titolo/data-ora/luogo/costo/countdown "tra N giorni",
      `countdownLabel()` su `daysBetween`), grid Pinterest 2 colonne per le
      idee. "Trasforma in appuntamento" (`mode="transform"`): dato che non
      esiste un "crea confermato diretto" lato backend, sia questo sia il
      FAB "Appuntamento confermato" (`mode="confirmed"`, senza idea di
      partenza) compongono `createAppointmentIdea` + `confirmAppointment` in
      sequenza (per "confirmed") o `updateAppointment` + `confirmAppointment`
      (per "transform", per salvare eventuali modifiche ai campi
      descrittivi prima di collegare il calendario) — due scritture lato
      client per scelta di design di backend2, non una RPC. Costo passato
      da input testo libero a `<input type="number">` (il DB è `numeric`,
      non testo).
    - **Wishlist** (`app/(app)/wishlist/page.tsx` → `components/wishlist/
      WishlistView.tsx` + `WishlistFormModal.tsx`): dati da
      `listWishlistFeed()` — **mai** query diretta su `wishlist_items` per
      la lista condivisa, sempre la view `wishlist_feed` (ribadito nei
      commenti di `lib/wishlist-actions.ts`). `isHiddenSurprise` è già
      calcolato lato server dalla view: WishlistView si limita a leggerlo,
      niente logica di mascheramento client-side residua. Filtri
      Regali/Attività/Tutto, toggle archivio Completati (mai delete secco —
      nessuna policy/grant DELETE lato DB, solo `completeWishlistItem`),
      checkbox modalità sorpresa abilitato per target "partner" **o**
      "entrambi" (vincolo DB reale, non solo "partner" come si potrebbe
      pensare a naso — corretto durante lo swap). Prezzo passato da testo
      libero a `<input type="number">` per lo stesso motivo di sopra.
      `selfId`/`partnerName` passati da `page.tsx` (via
      `getCurrentCoupleData()`) per distinguere "aggiunto da te" dal
      partner senza dover risolvere `created_by` via join `profiles` — una
      coppia ha solo due persone.
  - Avvisato qa2 (due messaggi: schermate mock pronte da testare, poi
    aggiornamento su dati reali) e backend2 (conferma allineamento enum,
    poi conferma swap fatto) via SendMessage.
  - Verifica fatta dopo lo swap: `npx tsc --noEmit` pulito, `npx jest` verde
    (9 suite, 101 test — qa2 ha aggiunto test nel frattempo), `npx next
    build` compila senza errori (route `/appuntamenti` e `/wishlist`
    generate come dinamiche), `npx next start` + curl confermano 307 verso
    `/login` per richieste non autenticate (nessun crash a runtime). Non
    verificato con un vero pass e2e a due account autenticati in questa
    sessione (limite di tempo, non di ambiente — il progetto Supabase cloud
    è lo stesso già validato in Fase 1): lasciato a qa2/main come prossimo
    passo se serve prima di chiudere la Fase 2.
  - **Due fix post-swap, trovati durante la verifica finale**:
    1. **Bug reale in `WishlistView.tsx`** (trovato da un test di qa2 che lo
       documentava deliberatamente, `tests/components/wishlist/
       WishlistView.test.tsx`): `complete()` chiamava
       `setError(result.error)` e poi `load()` senza `await` — `load()` fa
       `setError(null)` in modo sincrono a inizio fetch, cancellando
       l'errore nello stesso batch React prima che l'utente potesse vederlo
       (il rollback dei *dati* funzionava già, solo il *messaggio* d'errore
       non compariva mai). Fix: `complete()` ora fa `await load()` e imposta
       l'errore DOPO, come ultima scrittura. Test di qa2 aggiornato di
       conseguenza (seguendo la nota che aveva lasciato lei stessa nel
       test), entrambi avvisati via SendMessage.
    2. **Ottimizzazione da backend2**: per `mode="confirmed"` (nuovo
       appuntamento dal FAB, non da un'idea) `AppointmentFormModal.tsx` ora
       chiama la nuova `createConfirmedAppointment()` (un solo INSERT già
       `status='confermato'`) invece di comporre
       `createAppointmentIdea`+`confirmAppointment` (che passava per uno
       stato 'idea' intermedio inutile — un INSERT+UPDATE di troppo e due
       eventi Realtime invece di uno). `mode="transform"` resta a due
       scritture separate (`updateAppointment`+`confirmAppointment`),
       corretto perché lì l'idea esiste già.
  - Verifica finale ripetuta dopo entrambi i fix: `npx tsc --noEmit`
    pulito, `npx jest` verde (**11 suite, 115 test**), `npx next build`
    pulito. Gap di copertura segnalato a qa2 (non colmato da frontend2 per
    restare nel proprio ruolo): nessun test copre ancora il path
    `mode="confirmed"` di `AppointmentFormModal.tsx` (solo `mode="transform"`
    è testato in `tests/components/appointments/AppointmentsView.test.tsx`).
    **Chiuso da qa2 poco dopo** (6 nuovi test per `createConfirmedAppointment`,
    vedi voce `qa2` sopra) — stato finale **11 suite, 121 test**, tutti
    verdi anche dopo l'aggiunta.
  - **Gap noto, lasciato aperto deliberatamente**: né `AppointmentsView.tsx`
    né `WishlistView.tsx` hanno una subscription Realtime (a differenza di
    `ThoughtsSection.tsx` in Fase 1) — ricaricano solo via `load()` dopo le
    proprie azioni locali, quindi un partner non vede in automatico le
    modifiche dell'altro senza riaprire/ricaricare la schermata. Backend2 ha
    comunque già abilitato Realtime su entrambe le tabelle lato DB, quindi
    aggiungerla lato UI sarebbe un'estensione naturale (stesso pattern già
    visto in Fase 1), ma non era nello scope assegnato a frontend2 per
    questa fase — non aggiunta per evitare scope creep. Discusso con qa2,
    che ha scritto `e2e/wishlist-surprise.spec.ts` (due account: A crea un
    regalo a sorpresa per B con `target`='partner'/'entrambi', B vede solo
    "Sorpresa in arrivo…" senza fughe di titolo/prezzo nel DOM e senza
    pulsante di completamento, A completa, B **dopo un refresh** vede tutto
    — il refresh è voluto, documentato nel file, non un limite del test) —
    pending come `pairing-calendar.spec.ts`, gate `E2E_SUPABASE_READY=1`,
    verificato solo `playwright --list` in questo sandbox. Se in futuro si
    aggiunge Realtime a queste due schermate, quel test va aggiornato per
    verificare l'aggiornamento live senza reload.
  - **✅ `e2e/wishlist-surprise.spec.ts` eseguito da main contro Supabase
    cloud reale, passato al primo colpo, nessun bug trovato.** Conferma
    end-to-end (non solo mock) che RLS di `wishlist_items`, la view
    `wishlist_feed` e `WishlistView.tsx` (che si limita a leggere
    `isHiddenSurprise` già calcolato lato server) reggono insieme — il
    punto più delicato di tutta la Fase 2, dato che qui un bug si traduce in
    una fuga di dati reale (sorpresa rovinata), non solo in un fastidio UX.
  - **Gap `mode="confirmed"` chiuso da qa2**: 2 test aggiunti in
    `tests/components/appointments/AppointmentsView.test.tsx` (flusso FAB →
    "📍 Appuntamento confermato" → `createConfirmedAppointment`, incluso il
    caso di errore col form che resta aperto). Stato finale verificato da
    frontend2: **11 suite, 123 test**, tutti verdi, `npx tsc --noEmit`
    pulito.
  - **Fase 2 chiusa lato frontend2 e qa2** (2026-09-01): entrambe le
    schermate costruite, collegate ai dati reali, bug trovati/corretti nel
    ping-pong frontend2↔qa2 (vedi sopra), e2e reale a due account passato.
    Nessun'altra azione prevista da frontend2 su Appuntamenti/Wishlist a
    meno di nuovi requisiti — Realtime (vedi gap noto sopra) resta l'unica
    estensione naturale non fatta, volutamente fuori scope.

## Nota di correzione (2026-08-31)

Una versione precedente di questa sezione diceva che la sessione era stata
chiusa dall'utente con **qa ancora in esecuzione a metà task**, dava per
"perso" quel lavoro (per il limite noto: i teammate in-process non
sopravvivono a un'interruzione/resume) e istruiva a rilanciare un nuovo
agente "qa" da zero per rifare `lib/messages-actions.ts` +
`ThoughtsSection.tsx` + lo scenario e2e.

**Non era corretto**: la sessione qa non si era affatto interrotta, era
solo ancora in esecuzione in background quando quella nota è stata scritta.
Ha portato a termine entrambi i task poco dopo (vedi voce `qa` sotto "Team
di agenti" sopra, ora aggiornata): test per `lib/messages-actions.ts`,
test del toggle ottimistico/rollback in `ThoughtsSection.tsx`, e lo
scenario e2e `e2e/pairing-calendar.spec.ts`. **Nessun rilancio necessario**
— se una futura sessione legge questo file, la Fase 1 lato QA è chiusa
com'è descritto sopra, non c'è nulla da ripartire.

Lezione per il futuro: prima di dichiarare un teammate in-process "perso"
in questo file, verificare col tool di messaggistica/lista agenti se è
davvero terminato piuttosto che assumerlo dalla sola chiusura della
sessione dell'utente — un agente in background può essere ancora vivo e
completare il lavoro dopo che la nota è stata scritta, come successo qui.

**Decisioni lasciate aperte per l'utente, non ancora prese**:
- Bug `npm run lint` rotto (eslint 9.39.5 + `FlatCompat`, `TypeError:
  Converting circular structure to JSON`) — non bloccante per Fase 1, da
  sistemare quando/se l'utente lo chiede esplicitamente.
- Vecchia copia del progetto in `~/Desktop/couples-app` (quella con i
  problemi di sync iCloud) non è stata cancellata — lasciata lì finché
  l'utente non conferma di poterla rimuovere.

## Colori partner distinti al pairing + rimozione "Speciale" dal form eventi (2026-09-01)

Piano approvato in
`/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`,
punti 1 e 2 (lavorati in parallelo al punto 3-4 — mesiversario/proiezione
ricorrenze — su file completamente disgiunti: non toccati `lib/calendar-dates.ts`
né `loadEvents` in `CalendarView.tsx`).

- **Punto 2 (chiuso, verificato)**: `components/calendar/EventFormModal.tsx`
  — rimossa l'opzione `{ value: "speciale", ... }` da `CATEGORY_OPTIONS`
  (non più selezionabile in creazione). Il remap in apertura form che già
  convertiva `"ciclo"` → `"personale"` ora converte **anche**
  `"speciale"` → `"personale"` (stesso pattern, nessuna logica nuova): se
  si apre in modifica un evento speciale auto-generato (compleanno/
  anniversario/mesiversario), la categoria mostrata/salvabile è
  "Personale". Salvare cambia davvero `category` a `"personale"` in DB —
  l'FK (`birthday_event_id`/`anniversary_event_id`/
  `monthly_anniversary_event_id`) continua a puntarci comunque, l'evento
  semplicemente sparisce dal countdown "prossima data speciale" (stessa
  classe di comportamento già accettata per "ciclo", nessuna nuova
  incoerenza). Aggiornati i test in
  `tests/components/calendar/EventFormModal.test.tsx`: verificato che
  "Data speciale" non è più un bottone selezionabile, e due nuovi test per
  il caso edit di un evento `category: "speciale"` (mostra "Personale"
  evidenziato, il submit invia `category: "personale"` a
  `updateCalendarEvent`).
- **Punto 1 (migration pronta, in attesa di apply — non ho credenziali
  DB)**: nuova migration
  `supabase/migrations/20260901080000_pairing_distinct_colors.sql`,
  `create or replace function public.accept_pairing_invite` con il corpo
  INTERO riprodotto identico da `20260831120200_pairing_functions.sql` più
  un solo passaggio aggiunto prima del return: se sia il colore di chi ha
  creato l'invito sia quello di chi accetta sono ancora il default
  `#A6C8F0` (blu, nessuno dei due mai personalizzato — non esiste UI per
  farlo, quindi oggi è sempre vero), assegna a chi ACCETTA il colore
  `#F7A6C4` (rosa, stesso valore già usato come default "partner A" nel
  design system, `docs/PLAN.md`). Condizione su ENTRAMBI i colori (non
  solo dell'invitante) per non sovrascrivere un'eventuale personalizzazione
  futura fatta da chi accetta prima del pairing. Nessuna nuova colonna,
  nessuna nuova RPC. **Segnalato a main via SendMessage**, in attesa di
  conferma che sia live. Dopo l'apply resta da fare (non retroattivo): fix
  manuale via SQL del colore di uno dei due partner della coppia
  Asia/Antonio già esistente (quella nello screenshot originale del bug).
- Verifica: `npx tsc --noEmit` pulito, `npx jest` verde (**18 suite, 213
  test** al momento di questa nota — include anche il lavoro degli altri
  agenti in parallelo sullo stesso run).

## Ambienti: produzione vs sviluppo/test (2026-09-02)

- **Git**: `main` = produzione (deploy Vercel Production). `dev` = lavoro di
  sviluppo/test, creato da `main`. Le nuove funzionalità si sviluppano su
  `dev` (o branch dedicati per singola feature), mai direttamente su `main`.
- **Supabase**: due progetti separati, stesso schema (applicato via
  `supabase db push` con le stesse migration di `supabase/migrations/`,
  nessun dump/restore manuale — vedi sotto).
  - Produzione: progetto Supabase reale, usato da `main`.
  - Test: nuovo progetto Supabase gratuito (`ecembbtyqpseelbgmufo`), schema
    identico ma **zero dati reali** (nessuna migration inserisce dati, solo
    DDL/RLS/funzioni/trigger — un progetto nuovo con le stesse migration
    applicate parte sempre vuoto).
- **Vercel**: `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
  configurate due volte ciascuna (stesso nome, ambito diverso): scope
  "Production" → progetto Supabase reale; scope "Preview" → progetto
  Supabase di test. Ogni push su un branch diverso da `main` genera
  automaticamente un URL di anteprima Vercel collegato al Supabase di test;
  il merge in `main` aggiorna la produzione vera.

## Come riprendere in una nuova sessione

1. Leggi questo file per lo stato attuale e le decisioni prese.
2. Se serve contesto più approfondito su design/architettura, leggi
   `docs/PLAN.md`.
3. Controlla `git log --oneline` per vedere cosa è stato effettivamente
   implementato (questo file potrebbe essere leggermente indietro rispetto
   al codice se la sessione si è interrotta a metà fase).
4. Se la sezione "Team di agenti" sopra indica un team in corso, verificane
   lo stato prima di rilanciare agenti (potrebbero servire nuovi teammate se
   la sessione precedente era in-process, che non sopravvivono al resume).
