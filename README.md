# Couples App

PWA per coppie: due persone si autenticano separatamente e si "accoppiano" tramite un codice di invito, poi condividono calendario, appuntamenti, wishlist regali/attività e una home con rituali quotidiani pensati per la coppia.

## Funzionalità

- **Calendario condiviso** — vista Giorno/Settimana/Mese, eventi personali/di coppia/speciali (compleanni, anniversario, mesiversario generati automaticamente)/ciclo (privato di default), ricorrenze, ricerca degli slot liberi comuni.
- **Appuntamenti** — idee non ancora fissate e appuntamenti confermati (un appuntamento confermato è un evento calendario a tutti gli effetti, non un dato duplicato).
- **Wishlist** — regali e attività, con "modalità sorpresa": i dettagli di un regalo per il partner restano nascosti finché non viene completato (RLS a due livelli).
- **Home** — countdown alla prossima data speciale, mazzetto "Ricordi" del giorno corrente, throwback "un anno fa oggi", quiz del giorno con rivelazione reciproca via Realtime, check-in emotivo quotidiano, anteprima impegni e wishlist.
- **Galleria foto** — storico completo delle foto condivise, a scroll infinito.
- **Profilo** — dati account, data di inizio relazione, preferenze quiz/mood check-in per la coppia.

## Stack tecnico

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: [Supabase](https://supabase.com) — Postgres, Auth, Storage (foto, bucket privato con signed URL), Realtime, Row Level Security (la maggior parte della logica di autorizzazione vive nelle policy RLS)
- **Hosting**: Vercel (frontend) + Supabase cloud (backend)
- **Test**: Jest + Testing Library per unit/component test, Playwright per scenari end-to-end

## Sviluppo locale

```bash
npm install
cp .env.local.example .env.local   # compila con le credenziali del tuo progetto Supabase
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

Variabili d'ambiente richieste (vedi `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Altri comandi utili

```bash
npm run lint       # ESLint
npm run test       # Jest (client Supabase sempre mockato)
npm run test:e2e   # Playwright (richiede un'istanza Supabase raggiungibile)
npm run build       # build di produzione
```

## Note

Questo repo contiene anche materiale di lavoro interno (`HANDOFF.md`, `docs/`) usato durante lo sviluppo assistito da AI — non fa parte della documentazione utente, ma è lasciato pubblico come log storico del progetto.
