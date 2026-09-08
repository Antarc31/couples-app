# Couples App — Project Knowledge (per Claude Project su claude.ai)

> **Cos'è questo file**: un brief compatto pensato per essere caricato come
> "Project knowledge" in un Project di claude.ai, così che ogni nuova
> conversazione (anche senza accesso al repo/terminale) parta già con il
> contesto giusto. È diverso da `CLAUDE.md`/`AGENTS.md`/`docs/WORKFLOW.md`,
> che sono istruzioni operative per Claude Code dentro il repo — questo è
> un riassunto per un pubblico che potrebbe non avere accesso al codice.
>
> **Va tenuto aggiornato**: quando in una sessione Claude Code emergono
> decisioni prodotto nuove, feature completate, o lezioni tecniche
> importanti, aggiorna questo file nello stesso giro di lavoro (non è
> automatico — l'utente deve poi ri-caricare il file aggiornato nel suo
> Project su claude.ai). Ultimo aggiornamento: 2026-09-08.

## L'app in breve

App PWA per coppie (non ancora un nome commerciale definito — repo/package
si chiama `couples-app`). Prodotto multi-coppia: due persone si
autenticano separatamente e si "accoppiano" con un codice di invito, poi
condividono:

- **Calendario** condiviso (vista Giorno/Settimana/Mese), eventi categoria
  personale (colore per-partner)/coppia/speciale (compleanni,
  anniversario, mesiversario — generati automaticamente)/ciclo (privato di
  default, condivisibile solo su scelta esplicita), ricorrenze
  (nessuna/annuale/mensile), pulsante "Trova buchi liberi" (slot comuni
  liberi).
- **Appuntamenti**: idee (non ancora fissate) + confermati — un
  appuntamento confermato È un evento calendario categoria "coppia", non
  un dato duplicato.
- **Wishlist**: regali/attività, con "modalità sorpresa" (i dettagli di un
  regalo per il partner restano nascosti finché non viene completato —
  RLS a due livelli, tabella base + view `wishlist_feed`).
- **Home** (schermata di apertura, il cuore emotivo dell'app): countdown
  alla prossima data speciale + prossimo traguardo/mesiversario
  ("CountdownHero"), mazzetto "Ricordi" swipeabile con i pensieri/foto
  scambiati **solo del giorno corrente** (non uno storico infinito — fix
  esplicito, vedi sotto), "Un anno fa oggi" (throwback), "Quiz del
  giorno" (indovina cosa risponderebbe il partner, con rivelazione e
  conferma reciproca via Realtime), "Come va oggi?" (check-in emotivo
  quotidiano), prossimi impegni, anteprima wishlist.
- **Galleria foto completa** (`/home/foto`): a differenza del mazzetto
  Home, mostra TUTTO lo storico foto, paginato a scroll infinito.
- **Profilo**: nickname ed email modificabili (l'email richiede conferma
  via link, non è istantanea), data di nascita, data di inizio relazione,
  toggle quiz/mood check-in per la coppia, uscita dalla coppia,
  cancellazione account.

**Estetica attuale** ("Diario di coppia", redesign completato a
2026-09-08): scrapbook monocromatico porpora — carta chiara (`#fbf6f9`),
inchiostro scuro (`#3a1029`), accento porpora (`#9c2e66`), bordi
tratteggiati sulle card, adesivi ruotati, cornici stile Polaroid. **Un
solo font in tutta l'app** (Space Grotesk, via `next/font/google`) — i
font decorativi corsivi (Caveat per i titoli, Instrument Serif per il
countdown) sono stati rimossi su richiesta esplicita dell'utente dopo
averli provati dal vivo: preferisce coerenza a decorazione.

## Stack tecnico

- **Frontend**: Next.js (App Router) + React + Tailwind CSS, TypeScript.
- **Backend**: Supabase — Postgres, Auth, Storage (foto, bucket privato
  `couple-photos` con signed URL), Realtime (usato dal Quiz), Row Level
  Security per isolare i dati per coppia (quasi tutta la logica di
  autorizzazione vive nelle policy RLS, non nel client).
- **Hosting**: Vercel (frontend), Supabase cloud (backend). Due progetti
  Supabase separati: uno di **test** (Preview Vercel) e uno di
  **produzione** (Production Vercel) — zero dati reali nel progetto di
  test.
- **Test**: Jest + Testing Library per unit/component test (client
  Supabase sempre mockato, mai contro Postgres reale nella suite
  automatica); qualche scenario end-to-end con Playwright scritto ad-hoc
  in passato contro Supabase reale (non fa parte della suite permanente).
- **Notifiche**: sistema di notifiche in-app (campanella) già attivo; Web
  Push (VAPID) predisposto lato codice ma la Edge Function di invio non è
  mai stata deployata (richiede un `supabase login` interattivo via
  browser, mai fatto in una sessione agente).
- **Piattaforma**: PWA installabile (no App Store/Play Store) — **ma
  l'utente ha detto esplicitamente di voler eventualmente portare l'app
  su App Store in futuro**. È un'iniziativa grande e separata (riscrittura
  UI, non un flag da girare), da pianificare seriamente quando l'utente è
  pronto — non va iniziata di sua iniziativa né lasciata intendere come
  "quasi gratis" solo perché la logica di business è riusabile.

## Workflow (repo `~/Developer/couples-app`)

- Due branch: `dev` (sviluppo, Preview Vercel su
  `couples-app-git-dev-arblanc.vercel.app`, protetto da login Vercel) e
  `main` (produzione, `couples-app-delta.vercel.app`).
- **Commit + push su `dev`: azione libera, mai da chiedere conferma.**
  **Merge `dev` → `main`: SEMPRE da confermare esplicitamente** (tocca
  produzione reale, deploy Vercel automatico).
- Prima di ogni push su `main`: `tsc --noEmit`, `npx jest`, `npx next
  build` tutti puliti — vedi sotto per un controllo aggiuntivo diventato
  necessario dopo un incidente reale.
- Le migration Supabase vanno sempre applicate prima al progetto di
  **test**, verificate, poi a quello di **produzione** — mai il
  contrario. Le connection string non sono salvate da nessuna parte,
  vanno richieste all'utente quando servono.
- Nota aperta: `.env.local` in locale punta al Supabase di **produzione**
  (non a quello di test) — `npm run dev` in locale scrive su dati reali.
  Deciso di non cambiarlo finché non richiesto esplicitamente
  dall'utente.

## Lezioni tecniche importanti (imparate con incidenti reali)

1. **Non chiamare mai direttamente, da un Server Component (una pagina
   `app/**/page.tsx` o `layout.tsx` SENZA `"use client"` in testa), una
   funzione esportata da un modulo `"use client"`** (es.
   `lib/messages-actions.ts`, `lib/quiz-actions.ts`,
   `lib/mood-actions.ts` — scritti per il client Supabase browser).
   Next.js lo permette silenziosamente a `tsc`/`next build` in locale, ma
   **lancia un errore solo a runtime, in produzione**
   ("Attempted to call X() from the server but X is on the client") — è
   già successo, ha rotto la Home in produzione per alcuni minuti prima
   del rollback/fix. Se serve usare dati di un modulo così lato server, o
   si renderizza il componente client stesso (passaggio di prop, non
   chiamata diretta) o si scrivono funzioni davvero server-only (client
   Supabase server, niente `"use client"` nel file). **Controllare sempre
   esplicitamente** (`grep` degli import nei Server Component coinvolti)
   prima di un push su `main` che tocca `lib/*-actions.ts`.
2. `lib/current-couple.ts` → `getCurrentCoupleData()` è la funzione più
   usata dell'app (chiamata dal layout autenticato e da ogni pagina).
   Avvolta in `cache()` di React per deduplicare la stessa chiamata tra
   layout e pagina nello stesso request; fa una singola query Postgres
   con embed (join impliciti via i nomi reali dei vincoli FK:
   `profiles_couple_id_fkey`, `couples_partner_1_id_fkey`,
   `couples_partner_2_id_fkey`) invece di tre round-trip sequenziali.
   Degrada con garbo (couple/partner null) invece di crashare se l'embed
   torna incompleto.
3. **Errori Postgres/Supabase grezzi non vanno mai mostrati all'utente**
   — sempre tradotti in italiano comprensibile via un helper
   `friendly*ErrorMessage` (vedi `friendlyAuthErrorMessage` in
   `lib/auth-actions.ts`), con fallback al messaggio originale solo per
   errori non ancora mappati (mai un buco silenzioso).
4. Nessuna pagina di errore personalizzata (`error.tsx`) nel progetto — un
   'eccezione non gestita in un Server Component produce la schermata di
   errore generica di Next.js/Vercel ("A server error occurred"), non
   qualcosa di brandizzato.

## Preferenze di prodotto/UX raccolte dall'utente

- Un solo font in tutta l'app, niente stili decorativi extra "solo perché
  fa scrapbook" — preferisce pulizia/coerenza.
- Titoli dei widget Home: iniziale maiuscola, dimensione contenuta (non
  enormi).
- Le card "quotidiane" (mazzetto Ricordi) devono restare scoped al giorno
  corrente — l'utente ha esplicitamente rifiutato l'idea di uno storico
  che si accumula all'infinito nello swipe, anche se lo storico completo
  resta comunque consultabile altrove (galleria foto).
- Preferisce testare visivamente su un device reale (PWA installata su
  iPhone) prima di considerare un cambio UI "fatto" — diversi giri di
  fix sono partiti da screenshot con cerchi rossi che indicavano
  imperfezioni non colte dal solo codice/build.
- Attenzione a non lasciare elementi UI che si sovrappongono/si toccano
  in modo indesiderato (es. bottoni troppo vicini o troppo lontani) — le
  richieste di questo tipo vanno lette in modo letterale e verificate col
  calcolo esatto degli spazi, non "a occhio".

## Documenti di riferimento nel repo

- `docs/PLAN.md` — piano di design/prodotto originale. Alcuni dettagli
  (tipografia Nunito/Quicksand, palette rosa/azzurro chiaro) sono
  **superati** dal redesign "Diario di coppia" descritto sopra — usare
  questo file (CLAUDE_PROJECT_KNOWLEDGE.md) per lo stato attuale, PLAN.md
  per il ragionamento/le decisioni prodotto originarie ancora valide
  (struttura navigazione, buchi comuni, modalità sorpresa, privacy
  ciclo, ecc.).
- `docs/WORKFLOW.md` — regole operative dev/main, Supabase test/produzione
  (fonte di verità, il riassunto sopra è derivato da lì).
- `HANDOFF.md` — log dettagliato sessione per sessione, molto lungo:
  consultare solo per il dettaglio storico di una feature specifica, non
  per una visione d'insieme (questo file serve a quello).
- `CLAUDE.md` / `AGENTS.md` — istruzioni operative per Claude Code dentro
  questo repo (non rilevanti per un Project su claude.ai senza accesso al
  codice).
