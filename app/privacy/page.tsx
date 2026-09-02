import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Couples App",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-5 py-8 text-ink">
      <div>
        <Link href="/" className="text-sm text-ink-soft underline">
          ← Torna all&apos;app
        </Link>
        <h1 className="mt-3 text-2xl font-extrabold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-ink-soft">Ultimo aggiornamento: 2 settembre 2026</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">1. Titolare del trattamento</h2>
        <p className="text-sm leading-relaxed">
          Couples App è sviluppata e gestita da Antonio Arcucci, che ne è anche il titolare del
          trattamento dei dati. Per qualunque richiesta relativa a questa policy o ai tuoi dati puoi
          scrivere a{" "}
          <a href="mailto:antoarcu310704@gmail.com" className="underline">
            antoarcu310704@gmail.com
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">2. A cosa serve Couples App</h2>
        <p className="text-sm leading-relaxed">
          Couples App è uno spazio privato condiviso tra due partner: calendario di coppia,
          appuntamenti, wishlist di regali e pensieri/foto da scambiarsi. Ogni coppia vede solo i
          propri dati: nessun contenuto è mai visibile a utenti di altre coppie.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">3. Dati che raccogliamo</h2>
        <ul className="list-disc pl-5 text-sm leading-relaxed">
          <li>
            <strong>Account:</strong> indirizzo email e password (la password non è mai leggibile da
            noi: viene salvata già cifrata dal nostro fornitore di autenticazione).
          </li>
          <li>
            <strong>Profilo:</strong> nome visualizzato, colore scelto, data di nascita e data di
            inizio relazione, se li inserisci.
          </li>
          <li>
            <strong>Contenuti che crei nell&apos;app:</strong> pensieri e messaggi testuali, foto
            caricate, eventi di calendario, appuntamenti/idee, elementi della wishlist.
          </li>
          <li>
            <strong>Dati tecnici minimi:</strong> se attivi le notifiche push, un identificativo
            tecnico del tuo dispositivo/browser necessario per inviartele (funzionalità non ancora
            attiva al momento in cui scriviamo).
          </li>
        </ul>
        <p className="text-sm leading-relaxed">
          Non raccogliamo dati per finalità pubblicitarie, non tracciamo la tua attività fuori
          dall&apos;app e non vendiamo né condividiamo i tuoi dati con terze parti a scopo di
          marketing.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">4. Perché li usiamo</h2>
        <p className="text-sm leading-relaxed">
          Esclusivamente per far funzionare l&apos;app: farti accedere, mostrare a te e al tuo
          partner i contenuti che create insieme, inviarti le notifiche che hai attivato. La base
          giuridica è l&apos;esecuzione del servizio che hai richiesto creando un account.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">5. Chi può vedere i tuoi dati</h2>
        <p className="text-sm leading-relaxed">
          Solo tu e la persona con cui sei accoppiato/a: i permessi di accesso sono applicati
          direttamente a livello di database (Row Level Security), non solo nell&apos;interfaccia
          dell&apos;app. I dati sono ospitati su Supabase (database e autenticazione) e Vercel
          (hosting dell&apos;app), entrambi fornitori infrastrutturali che non accedono ai contenuti
          se non per manutenzione tecnica. Non ci sono altri destinatari terzi.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">6. Quanto conserviamo i dati</h2>
        <p className="text-sm leading-relaxed">
          I tuoi dati restano finché il tuo account esiste. Puoi cancellare l&apos;account in
          qualunque momento dalla schermata Profilo dell&apos;app: la cancellazione è immediata e
          definitiva, e rimuove anche tutti i contenuti della coppia (calendario, messaggi, foto,
          appuntamenti, wishlist), non solo i tuoi dati personali — perché in Couples App questi
          contenuti sono condivisi tra i due partner. Il tuo partner mantiene il proprio account, ma
          perde l&apos;accoppiamento e la cronologia condivisa.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">7. I tuoi diritti</h2>
        <p className="text-sm leading-relaxed">
          Hai diritto ad accedere, correggere o cancellare i tuoi dati in qualsiasi momento
          (direttamente dall&apos;app, dove possibile, oppure scrivendoci). Se ritieni che i tuoi
          dati siano trattati in modo scorretto, hai diritto a presentare reclamo al Garante per la
          protezione dei dati personali.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">8. Sicurezza</h2>
        <p className="text-sm leading-relaxed">
          Tutte le connessioni tra l&apos;app e i nostri server sono cifrate (HTTPS). Le foto sono
          salvate in uno spazio privato accessibile solo dopo verifica di identità, mai con link
          pubblici indovinabili.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">9. Età minima</h2>
        <p className="text-sm leading-relaxed">
          Couples App non è pensata per persone sotto i 16 anni.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">10. Modifiche a questa policy</h2>
        <p className="text-sm leading-relaxed">
          Se questa policy cambierà in modo rilevante te lo comunicheremo nell&apos;app prima che le
          modifiche entrino in vigore.
        </p>
      </section>
    </div>
  );
}
