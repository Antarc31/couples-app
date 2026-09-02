import { test, expect, type Page } from "@playwright/test";

/**
 * Scenario e2e di fine Fase 1 richiesto da docs/PLAN.md (sezione
 * "Verifica"): due account accoppiati che interagiscono sul calendario.
 *
 * Flusso: A si registra -> A genera un codice di pairing -> B si registra
 * -> B inserisce il codice e si accoppia con A -> A crea un evento di
 * categoria "coppia" sul calendario -> B (sessione/account separato) vede
 * lo stesso evento, con lo stesso colore, sul proprio calendario -> l'evento
 * compare anche in Appuntamenti → Confermati per entrambi. Verifica quindi
 * end-to-end: signup, RPC di pairing, RLS su `calendar_events` (B deve
 * poter leggere un evento creato da A nella stessa coppia), la coerenza del
 * colore renderizzato (`lib/calendar-colors.ts`) tra i due account, e (piano
 * UX "Gruppo Calendario/Appuntamenti", punto 4, esteso in questo file dopo
 * l'unificazione Calendario -> Appuntamenti) che creare un evento "coppia"
 * dal Calendario generi anche la riga `appointments` collegata, visibile a
 * entrambi i partner (RLS di `appointments` a livello di coppia).
 *
 * ⚠️ PENDING — non gira in questo sandbox: richiede un'istanza Supabase
 * raggiungibile (locale via `supabase start`, che richiede Docker — non
 * disponibile qui, vedi HANDOFF.md) con le migration applicate, oppure un
 * progetto Supabase di test con conferma email disattivata per i signup
 * (altrimenti il login subito dopo la signup fallisce in attesa di
 * conferma). Il test è scritto per essere eseguibile così com'è non appena
 * l'ambiente è disponibile: basta impostare la variabile d'ambiente
 * `E2E_SUPABASE_READY=1` (oltre a `NEXT_PUBLIC_SUPABASE_URL`/
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` per l'app stessa) — non serve toccare
 * questo file. Verificati manualmente da frontend, in isolamento e senza
 * Supabase reale: routing/guardie, PWA, e le singole schermate via
 * screenshot (vedi HANDOFF.md, sezione "Team di agenti" → frontend).
 */
test("due account si accoppiano e condividono un evento di calendario", async ({ browser }) => {
  test.skip(
    process.env.E2E_SUPABASE_READY !== "1",
    "Richiede un'istanza Supabase reale raggiungibile (Docker non disponibile in questo sandbox). " +
      "Imposta E2E_SUPABASE_READY=1 con un progetto/istanza Supabase configurata (migration applicate, " +
      "conferma email disattivata per i signup di test) per abilitarlo.",
  );

  const stamp = Date.now();
  const password = "test-password-123";
  const partnerAEmail = `e2e-partner-a-${stamp}@example.com`;
  const partnerBEmail = `e2e-partner-b-${stamp}@example.com`;
  const partnerAName = "Anna E2E";
  const partnerBName = "Marco E2E";
  const eventTitle = `Evento e2e ${stamp}`;

  // Due contesti browser separati = due sessioni/account realmente distinte
  // (cookie separati), non due tab dello stesso utente.
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // --- 1. Signup + login di partner A -----------------------------------
    await signUpAndLogIn(pageA, { name: partnerAName, email: partnerAEmail, password });
    // Non ancora accoppiato -> l'app redirige a /pairing (vedi app/page.tsx).
    await pageA.waitForURL(/\/pairing$/);

    // --- 2. A genera un codice di pairing -----------------------------------
    // Due bottoni hanno lo stesso testo "Genera codice": il tab del
    // segmented control e il bottone reale dentro la card (vedi
    // components/auth/PairingClient.tsx). Il tab precede il bottone reale
    // nell'ordine del documento, quindi .last() prende quello giusto.
    await pageA.getByRole("button", { name: "Genera codice", exact: true }).last().click();
    const codeLocator = pageA.locator("p.font-mono.text-3xl");
    await expect(codeLocator).toBeVisible();
    const inviteCode = (await codeLocator.textContent())?.trim();
    expect(inviteCode).toBeTruthy();

    // --- 3. Signup + login di partner B -------------------------------------
    await signUpAndLogIn(pageB, { name: partnerBName, email: partnerBEmail, password });
    await pageB.waitForURL(/\/pairing$/);

    // --- 4. B accetta il codice di A -----------------------------------------
    await pageB.getByRole("button", { name: "Ho un codice", exact: true }).click();
    await pageB.getByPlaceholder("ES. 7K4QXPMN").fill(inviteCode!);
    await pageB.getByRole("button", { name: /Accoppiati/ }).click();

    await expect(pageB.getByText(`Accoppiato/a con ${partnerAName}!`)).toBeVisible();
    await pageB.getByRole("button", { name: "Vai alla Home" }).click();
    await pageB.waitForURL(/\/home$/);

    // A non ha un listener realtime sulla propria pagina /pairing: la
    // conferma che anche A ora risulta accoppiato/a si fa ricaricando.
    await pageA.goto("/home");
    await pageA.waitForURL(/\/home$/);

    // --- 5. A crea un evento di categoria "coppia" sul calendario -----------
    await pageA.goto("/calendario");
    await pageA.getByRole("button", { name: "Nuovo evento" }).click();
    await pageA.getByPlaceholder("Titolo (es. Cena da Marco)").fill(eventTitle);
    await pageA.getByRole("button", { name: "Di coppia", exact: true }).click();
    // Data/ora lasciate al default (oggi) per semplicità.
    await pageA.getByRole("button", { name: "Crea evento" }).click();

    // Passa alla vista Giorno (oggi è già la data selezionata di default) per
    // vedere l'evento appena creato senza dover riaprire l'agenda del giorno.
    await pageA.getByRole("button", { name: "Giorno", exact: true }).click();
    const eventOnA = pageA.getByText(eventTitle);
    await expect(eventOnA).toBeVisible();

    // --- 6. B vede lo stesso evento sul proprio calendario (RLS) ------------
    await pageB.goto("/calendario");
    await pageB.getByRole("button", { name: "Giorno", exact: true }).click();
    const eventOnB = pageB.getByText(eventTitle);
    await expect(eventOnB).toBeVisible();

    // --- 7. Stesso colore (categoria "coppia" -> corallo) per entrambi ------
    // Nella vista Giorno il colore è applicato come background-color della
    // card evento stessa (vedi components/calendar/DayTimeline.tsx, estratto
    // da CalendarView.tsx nel piano UX "Gruppo Calendario/Appuntamenti",
    // punto 6 — posizionamento assoluto per far occupare all'evento
    // l'intera durata, non più solo lo slot di inizio), non a un pallino
    // separato. La card è il <div> più interno che contiene il titolo:
    // `.last()` sul locator prende l'elemento più annidato tra quelli che
    // matchano (i div antenati la precedono in document order). Confrontiamo
    // il colore calcolato tra i due account per verificare che eventColor()
    // sia coerente indipendentemente da chi guarda (vedi
    // lib/calendar-colors.ts).
    const cardA = pageA.locator("div", { hasText: eventTitle }).last();
    const cardB = pageB.locator("div", { hasText: eventTitle }).last();
    const colorA = await cardA.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(cardB).toHaveCSS("background-color", colorA);

    // --- 8. L'evento "coppia" compare anche in Appuntamenti → Confermati ----
    // Piano UX "Gruppo Calendario/Appuntamenti", punto 4 (unificazione
    // Calendario -> Appuntamenti): creare un evento categoria "coppia" dal
    // Calendario ora chiama createConfirmedAppointment (vedi
    // components/calendar/EventFormModal.tsx) invece dell'insert diretto su
    // calendar_events, quindi genera anche la riga `appointments`
    // corrispondente. Verifichiamo che compaia per ENTRAMBI gli account (la
    // RLS di `appointments` è a livello di coppia, non solo per il
    // creatore — vedi supabase/migrations/20260901010000_appointments.sql).
    // Il tab di default di /appuntamenti è già "Confermati", nessun
    // ulteriore click necessario.
    await pageA.goto("/appuntamenti");
    await expect(pageA.getByText(eventTitle)).toBeVisible();

    await pageB.goto("/appuntamenti");
    await expect(pageB.getByText(eventTitle)).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

/** Registra un nuovo account e poi effettua il login (stesse credenziali). */
async function signUpAndLogIn(
  page: Page,
  { name, email, password }: { name: string; email: string; password: string },
) {
  await page.goto("/login");

  // Signup.
  await page.getByRole("button", { name: "Registrati", exact: true }).click();
  await page.getByPlaceholder("Come ti chiami?").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.locator('form button[type="submit"]').click();

  // Dopo la signup il form torna in modalità login con la password
  // svuotata (vedi components/auth/LoginForm.tsx) e mostra un avviso;
  // assumiamo conferma email disattivata sul progetto Supabase di test,
  // quindi il login subito dopo funziona.
  await expect(page.getByText("Registrazione completata.", { exact: false })).toBeVisible();
  await page.getByPlaceholder("Password").fill(password);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
