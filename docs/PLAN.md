# Piano: App per coppie (PWA, multi-coppia) — design, funzionalità, architettura

## Contesto

L'utente vuole realizzare un'app per coppie con: calendario condiviso (con
"buchi" comuni), sezione appuntamenti (confermati + idee), wishlist (regali +
attività), e una dashboard con messaggi/foto/reminder scambiati tra i due
partner. Decisioni già prese con l'utente:

- **Piattaforma**: web app PWA (installabile da browser, no store nativi).
- **Scope**: prodotto multi-coppia (non solo per uso personale) — serve
  autenticazione e pairing tra due account.
- **"Widget"**: non è un widget di sistema OS, è una schermata/dashboard
  dentro l'app.
- Progetto greenfield: nessuno scaffold esistente sul Desktop (verificato —
  `app/` e `.claude/launch.json` trovati appartengono ad altri progetti
  scollegati, non a questo).

Obiettivo di questo piano: fissare design/UX/schermate, sistema di design
(colori/stile minimal a base rosa), architettura tecnica di base, e come
distribuire il lavoro tra agenti (frontend / backend / QA) prima di iniziare
l'implementazione.

## Struttura di navigazione

Bottom tab bar mobile-first, 5 sezioni:

1. **Home** (dashboard/"widget") — schermata di default dopo login
2. **Calendario**
3. **Appuntamenti**
4. **Wishlist**
5. **Profilo**

Decisione di design importante: **gli appuntamenti confermati sono la stessa
entità degli eventi di calendario**, non due liste scollegate — un
appuntamento fissato appare automaticamente anche nel calendario. La sezione
"Appuntamenti" è una vista filtrata/arricchita (con luogo, costo, note) sugli
stessi dati, più le "idee" (non ancora fissate).

## Screen-by-screen

### Onboarding / Auth
- Login/signup (email o magic link).
- Se l'utente non è ancora accoppiato: schermata pairing — genera un
  codice/link da condividere, oppure inserisci il codice del partner.
- Estetica: sfondo rosa chiaro/gradiente tenue, icona cuore, CTA grande e
  arrotondata.

### Home (dashboard)
Scroll verticale, card in stile minimal:
- Header: saluto + avatar partner + countdown alla prossima data speciale
  ("🎉 8 giorni al vostro anniversario"), calcolato da data inizio relazione
  (impostata in Profilo).
- Card "Pensiero del giorno": ultimo messaggio/reminder ricevuto, swipeabile
  per vedere i precedenti; reazione veloce con cuore.
- Card foto: striscia orizzontale delle foto scambiate più recenti, tap per
  full-screen; link "vedi tutte" → timeline fotografica completa.
- Card "prossimi impegni": prossimi 2-3 eventi di calendario/appuntamento.
- Card wishlist: ultimi elementi aggiunti.
- FAB in basso a destra: "Manda un pensiero" (testo/foto/reminder al
  partner) — è il cuore emotivo dell'app, deve restare il primo schermo.

### Calendario
- Vista mese di default, toggle **Giorno / Mese** (segmented control in
  alto) per passare dalla panoramica mensile al dettaglio ora-per-ora di una
  giornata.
- Legenda fissa in alto: colore partner A, colore partner B (personalizzabili
  in Profilo, default azzurro/rosa), rosso corallo per eventi di coppia, oro
  per date speciali (anniversari/compleanni), lavanda per ciclo (colore
  diverso apposta, vedi nota privacy sotto).
- Vista Mese: celle giorno con puntini colorati per categoria (max 3 + "+n"),
  tap per agenda del giorno in bottom sheet.
- Vista Giorno: timeline oraria con gli eventi di entrambi affiancati,
  ciascuno con il colore della propria categoria e il tag/descrizione visibile
  per esteso.
- **Buchi comuni**: toggle "Mostra disponibilità comune" che evidenzia
  giorni/fasce libere per entrambi (in vista Mese sui giorni, in vista Giorno
  sulle fasce orarie libere); pulsante dedicato "Trova un buco" con vista dei
  prossimi slot liberi condivisi.
- FAB "+": categoria (personale/coppia/speciale — determina il colore),
  **tag/descrizione** libero o a scelta rapida (es. amici, uni, sport, lavoro,
  famiglia — indipendente dal colore, mostrato come etichetta/icona piccola
  sull'evento), ricorrenza per anniversari/compleanni, promemoria on/off.
- **Privacy ciclo**: tracciato di default visibile solo a chi lo inserisce,
  con toggle esplicito "condividi con il partner" — non va condiviso
  automaticamente solo perché è una coppia.

### Appuntamenti
- Segmented control: "Confermati" | "Idee".
- Confermati: card ordinate per data (titolo, data, luogo, costo, countdown
  "tra 5 giorni"); stessi record del calendario.
- Idee: grid tipo Pinterest (foto, titolo, tag viaggio/attività/ristorante);
  pulsante "Trasforma in appuntamento" pre-compila la creazione in
  Confermati (e crea automaticamente l'evento calendario).

### Wishlist
- Filtri: "Regali" | "Attività di coppia" | "Tutto".
- Card: titolo, chi l'ha aggiunto, priorità, prezzo/link opzionale, foto.
- Spunta/swipe per completare → **archivio "Completati"** invece di delete
  secco, per mantenere memoria di cosa è stato fatto insieme.
- **Modalità sorpresa**: un regalo aggiunto come "per il partner" nasconde i
  dettagli al destinatario finché non viene segnato completato — altrimenti
  si rovina la sorpresa.

### Profilo
- Dati account, nome/data inizio relazione (usata per countdown/anniversari
  automatici), colori personalizzati per ciascun partner, gestione notifiche
  push, gestione pairing (compreso "scoppio di coppia").

## Design system

- **Palette**: base chiara (`#FFF8F6` circa), rosa primario tenue (`#F7A6C4`
  circa), blu cielo tenue come default partner B (`#A6C8F0`) — entrambi
  **personalizzabili** in Profilo, non forzati per genere. Rosso corallo
  (`#E8677D`) per eventi di coppia. Oro/ambra (`#E8B86D`) per date speciali.
  Lavanda (`#C9B6E4`) per il ciclo, colore volutamente distinto per
  discrezione.
- **Tipografia**: sans-serif arrotondato e amichevole (es. Nunito/Quicksand),
  line-height generoso.
- **Componenti**: angoli molto arrotondati (16-20px), ombre soffuse a basso
  contrasto, molto white space, icone line-style arrotondate, micro-animazioni
  su completamento wishlist e invio messaggi (piccolo effetto cuore/confetti
  per le date speciali).

## Pareri su cosa funziona / cosa no / cosa aggiungere

**Funziona bene:**
- Calendario condiviso con differenziazione per categoria — base solida.
- Concetto "buchi comuni" — feature distintiva, poche app coppia lo fanno,
  vale la pena investirci.
- Wishlist con archivio invece di delete — mantiene memoria.
- Dashboard "pensieri/foto" come primo schermo — è il cuore emotivo, va
  tenuto in evidenza.

**Da correggere rispetto all'idea iniziale:**
- Appuntamenti e calendario NON vanno tenuti come liste separate/duplicate:
  stessa fonte dati, vista diversa (vedi sopra).
- Ciclo mestruale non va condiviso automaticamente di default — privacy
  opt-in.
- Regali "per il partner" vanno nascosti in dettaglio fino al completamento
  (altrimenti l'app rovina le sorprese, che è il contrario dello spirito
  dell'app).

**Da aggiungere:**
- Countdown automatico su Home per la prossima data speciale.
- Streak/contatore giorni insieme, calcolato da data inizio relazione.
- Timeline fotografica completa (non solo le foto recenti in Home).
- Messaggi/foto programmabili per il futuro (es. buongiorno automatico o
  messaggio per un giorno speciale già pianificato oggi).

## Architettura tecnica (raccomandazione)

- **Utilizzo cross-device**: essendo una PWA, si usa da browser su telefono e
  PC senza differenze di dati/account, ed è installabile su entrambi ("Aggiungi
  a Home" su mobile, "Installa app" su desktop Chrome/Edge) per un'esperienza
  a schermo intero senza passare da App Store/Play Store.
- **Stack**: Next.js (React) come frontend con PWA (manifest + service
  worker), **Supabase** come backend — Postgres relazionale (adatto a
  calendario/appuntamenti/wishlist), Auth integrata, Realtime (sincronizza
  live i dati tra i due partner), Storage per le foto, Row Level Security per
  isolare i dati per coppia. Hosting: Vercel (frontend) + Supabase cloud.
- **Notifiche push**: Web Push standard (VAPID) via Supabase Edge Functions.
  Nota importante: su iOS Safari le push funzionano solo da iOS 16.4+ e solo
  se la PWA è stata "aggiunta alla schermata Home" — prevedere un fallback
  con centro notifiche in-app per chi non ha installato la PWA.
- **Modello dati principale**: `users`, `couples` (con
  `relationship_start_date`), `pairing_invites` (codice, stato),
  `calendar_events` (categoria: personale/coppia/speciale/ciclo, tag/
  descrizione libero es. amici/uni/sport, ricorrenza, flag visibilità per il
  ciclo), `appointments` (stato confermato/idea,
  collegato a un `calendar_event` quando confermato), `wishlist_items`
  (categoria regalo/attività, target self/partner/entrambi, priorità, stato
  attivo/completato, flag "sorpresa"), `messages` (testo/foto/reminder,
  `scheduled_for` per invii programmati).
- **Buchi comuni**: calcolati a runtime (client o edge function) come
  differenza tra il range richiesto e l'unione degli intervalli occupati dei
  due partner, escludendo eventi ciclo non condivisi.
- **Ricorrenze**: regola semplice per compleanni/anniversari (annuale); per
  il ciclo, previsione basata sulla media delle ultime N durate registrate
  (nessun ML necessario per l'MVP).

## Costi stimati

- **Supabase e Vercel hanno piani gratuiti** sufficienti per MVP e per un
  numero contenuto di coppie: il limite più probabile da raggiungere nel
  tempo è lo storage foto (1GB free su Supabase), non il database o gli
  utenti attivi.
- **Upgrade a pagamento necessario solo se**: lo storage foto supera ~1GB
  (Supabase, circa 25$/mese oltre soglia), oppure l'app diventa un prodotto
  commerciale vero (Vercel richiede il piano Pro, ~20$/mese, per uso non
  personale/non gratuito per policy, non per limiti tecnici).
- Dominio personalizzato opzionale: 10-15€/anno, non necessario per iniziare.

## Roadmap a fasi

1. **MVP**: auth + pairing, calendario base (eventi personali/coppia, no
   ricorrenza), Home con invio messaggi/foto semplice, installabilità PWA.
2. **Appuntamenti + Wishlist**: confermati/idee collegati al calendario,
   wishlist con completamento/archivio, notifiche push base.
3. **Feature distintive**: ricorrenze automatiche, calcolo buchi comuni,
   tracking ciclo con privacy e previsione, modalità sorpresa regali,
   messaggi programmati.
4. **Polish**: timeline fotografica, streak/countdown, temi colore
   personalizzabili, animazioni, pass finale di QA.

## Distribuzione del lavoro: team di 3 agenti

Segue il framework della skill `agent-teams-guideline`: questo caso rientra
nel livello "agent team" perché i tre ruoli lavorano su file/domini non
sovrapposti ma devono coordinarsi su un contratto comune (API/modello dati).

- **Frontend agent**: componenti UI, schermate, navigazione, design system,
  manifest PWA e service worker.
- **Backend agent**: schema dati, auth + pairing, API/Edge Functions, sync
  realtime, logica notifiche push, configurazione hosting.
- **QA agent**: scrive ed esegue test unitari modulo per modulo non appena
  frontend/backend completano una feature; a fine di ogni fase esegue una
  passata di test end-to-end (scenario con due utenti accoppiati che
  interagiscono su calendario/appuntamenti/wishlist/messaggi) e produce un
  report finale con esito, copertura e bug trovati.

Coordinamento: prima di iniziare, frontend e backend agent concordano il
contratto dati/API (schema delle entità sopra) così possono lavorare in
parallelo senza bloccarsi; il QA agent reclama i task di test non appena una
feature è marcata completata dagli altri due.

## Verifica

- Ogni fase si conclude con: build della PWA installabile e funzionante in
  locale, test unitari verdi, e — dalla fase 1 in poi — almeno uno scenario
  end-to-end con due account accoppiati che validano la funzionalità appena
  costruita.
- Il report finale del QA agent (fase 4) deve coprire tutte le funzionalità
  elencate in questo piano prima di considerare il progetto pronto per un
  primo utilizzo reale.
