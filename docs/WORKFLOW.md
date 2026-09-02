# Flusso di lavoro: sviluppo/test vs produzione

Istruzioni operative per chi (umano o agente Claude Code) lavora su questo
repository da qui in poi. Il progetto ha **due ambienti completamente
separati** — mai mescolarli.

## Mappa degli ambienti

| | Produzione | Sviluppo/Test |
|---|---|---|
| Branch git | `main` | `dev` (+ branch feature creati da `dev`) |
| Deploy Vercel | Production (`couples-app-delta.vercel.app`) | Preview (`couples-app-git-<branch>-arblanc.vercel.app`, uno per branch, protetto da login Vercel) |
| Progetto Supabase | reale (project ref `srdxyawyhqppegztyysm`) | test, gratuito (project ref `ecembbtyqpseelbgmufo`), **zero dati reali** |
| Env var Vercel | scope "Production" | scope "Preview" |
| `.env.local` (locale, `npm run dev`) | **attualmente punta al progetto reale** — vedi nota sotto | — |

Le due coppie `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
esistono **due volte** nel pannello Vercel (Environment Variables), stesso
nome, ambito diverso (Production vs Preview) — è così che lo stesso codice,
deployato da branch diversi, parla a due database diversi senza nessuna
logica condizionale nel codice stesso.

> **Nota aperta**: `.env.local` su questa macchina punta ancora al progetto
> Supabase di **produzione**, quindi `npm run dev` in locale oggi scrive
> sui dati reali. Se si vuole che anche lo sviluppo locale sia isolato,
> `.env.local` va aggiornato a puntare al progetto di test — non fatto
> finora perché non esplicitamente richiesto, va deciso con l'utente prima
> di cambiarlo.

## Regola per Claude Code: dove si lavora

- **Il lavoro di sviluppo/feature/fix si fa SEMPRE su `dev` o su un branch
  creato da `dev`**, mai direttamente su `main`.
- All'inizio di una sessione o di un nuovo task, verificare il branch
  corrente (`git branch --show-current`). Se risulta `main` e il task è
  sviluppo (non un merge esplicitamente richiesto), passare a `dev`
  (`git checkout dev && git pull`) prima di iniziare a modificare file.
- Push regolari su `dev`/branch feature sono **azioni git normali**, non
  richiedono conferma esplicita ogni volta (stesso principio delle azioni
  reversibili già in uso in questo progetto).
- **Il merge di `dev` (o di un branch feature) dentro `main` è invece
  un'azione che tocca la produzione reale** — richiede sempre conferma
  esplicita dell'utente prima di essere eseguito, anche se il merge in sé
  è tecnicamente reversibile (`git revert`), perché il push successivo su
  `main` fa scattare un deploy Vercel Production reale e visibile agli
  utenti dell'app.

## Migration del database

Le migration in `supabase/migrations/` sono l'unica fonte di verità dello
schema (mai modificare lo schema a mano via SQL Editor senza poi scrivere
la migration corrispondente qui).

Ordine da rispettare per ogni nuova migration:
1. Applicarla **prima** al progetto Supabase di **test**
   (`npx supabase db push --db-url '<connection-string-test>'`), verificarla
   lì (manualmente o tramite l'app deployata su un Preview Vercel).
2. Solo dopo conferma che funziona, applicarla anche al progetto di
   **produzione** con la stessa modalità, usando la connection string di
   produzione.
3. Le connection string (Session Pooler, con password) non sono salvate da
   nessuna parte in questo repository o in memoria persistente — vanno
   richieste all'utente ogni volta che servono, per entrambi i progetti.

Le migration **non** duplicano mai dati reali: contengono solo DDL/RLS/
funzioni/trigger, mai `INSERT` di dati applicativi — per questo applicare
le stesse migration a un progetto Supabase nuovo produce sempre uno schema
identico ma con database vuoto.

## Riepilogo pratico di un ciclo di lavoro

1. `git checkout dev && git pull` (o branch feature da `dev`).
2. Sviluppo, commit, `git push origin <branch>`.
3. Vercel crea automaticamente l'URL di Preview per quel branch, collegato
   al Supabase di test — verifica lì, anche più volte, senza rischio per i
   dati reali.
4. Se la modifica richiede una migration, applicarla prima al Supabase di
   test (vedi sopra) prima di aprire/testare il Preview.
5. Quando l'utente conferma che è pronto: merge in `main`
   (`git checkout main && git pull && git merge dev`), applicare
   l'eventuale migration anche al Supabase di produzione, poi
   `git push origin main` → deploy automatico su Production.
