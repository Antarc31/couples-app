import { test, expect, type Page } from "@playwright/test";

/**
 * Scenario e2e di Fase 2 (docs/PLAN.md, sezione "Verifica": ogni fase si
 * chiude con almeno uno scenario e2e a due account): la modalità sorpresa
 * della Wishlist, il punto più delicato di tutta la fase (creatore vede
 * tutto, destinatario non vede NULLA finché non completato, poi vede tutto).
 *
 * Flusso: A e B si accoppiano (stesso flusso di e2e/pairing-calendar.spec.ts)
 * -> A aggiunge un regalo "per il partner" in modalità sorpresa -> A vede
 * subito il proprio item pieno -> B (account/contesto separato) apre la sua
 * Wishlist e vede una card presente ma mascherata ("🎁 Sorpresa in
 * arrivo…"), MAI il titolo/prezzo reali nel proprio DOM -> A segna l'item
 * come completato -> B, dopo un refresh, vede finalmente i dettagli reali.
 * Esercita l'intera catena reale: RLS su `wishlist_items`
 * (`wishlist_items_select_hide_active_surprise`) + view `wishlist_feed`
 * (mascheramento dei 5 campi sensibili + `is_hidden_surprise`) + UI
 * (`WishlistView.tsx` che si limita a leggere quel flag, nessuna logica di
 * mascheramento client-side).
 *
 * Struttura/selettori concordati con backend2 (vedi HANDOFF.md) e verificati
 * a mano contro il markup reale di `WishlistFormModal`/`WishlistView`
 * (nessuna congettura) — stesso pattern di due `BrowserContext` separati
 * (due account/sessioni reali, non due tab) di pairing-calendar.spec.ts.
 *
 * ⚠️ PENDING — stesso motivo di e2e/pairing-calendar.spec.ts: richiede
 * un'istanza Supabase raggiungibile con le migration applicate e conferma
 * email disattivata per i signup. Gated da `E2E_SUPABASE_READY=1` (oltre a
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — non serve
 * toccare questo file quando l'ambiente sarà pronto.
 *
 * Il refresh di B dopo il completamento (step 6) è deliberato, non un
 * limite del test: WishlistView non ha un listener Realtime (a differenza
 * di ThoughtsSection in Fase 1), quindi B deve ricaricare per vedere lo
 * stato aggiornato — comportamento atteso, non un bug.
 */
test("un regalo a sorpresa per il partner resta nascosto a B finché A non lo completa", async ({ browser }) => {
  test.skip(
    process.env.E2E_SUPABASE_READY !== "1",
    "Richiede un'istanza Supabase reale raggiungibile (Docker non disponibile in questo sandbox). " +
      "Imposta E2E_SUPABASE_READY=1 con un progetto/istanza Supabase configurata (migration applicate, " +
      "conferma email disattivata per i signup di test) per abilitarlo.",
  );

  const stamp = Date.now();
  const password = "test-password-123";
  const partnerAEmail = `e2e-wl-a-${stamp}@example.com`;
  const partnerBEmail = `e2e-wl-b-${stamp}@example.com`;
  const partnerAName = "Anna WL";
  const partnerBName = "Marco WL";
  const giftTitle = `Sorpresa e2e ${stamp}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // --- 1. Pairing (stesso flusso di pairing-calendar.spec.ts) -------------
    await signUpAndLogIn(pageA, { name: partnerAName, email: partnerAEmail, password });
    await pageA.waitForURL(/\/pairing$/);
    await pageA.getByRole("button", { name: "Genera codice", exact: true }).last().click();
    const codeLocator = pageA.locator("p.font-mono.text-3xl");
    await expect(codeLocator).toBeVisible();
    const inviteCode = (await codeLocator.textContent())?.trim();
    expect(inviteCode).toBeTruthy();

    await signUpAndLogIn(pageB, { name: partnerBName, email: partnerBEmail, password });
    await pageB.waitForURL(/\/pairing$/);
    await pageB.getByRole("button", { name: "Ho un codice", exact: true }).click();
    await pageB.getByPlaceholder("ES. 7K4QXPMN").fill(inviteCode!);
    await pageB.getByRole("button", { name: /Accoppiati/ }).click();
    await expect(pageB.getByText(`Accoppiato/a con ${partnerAName}!`)).toBeVisible();
    await pageB.getByRole("button", { name: "Vai alla Home" }).click();
    await pageB.waitForURL(/\/home$/);
    await pageA.goto("/home"); // A non ha listener realtime su /pairing, vedi commento in pairing-calendar.spec.ts

    // --- 2. A aggiunge un regalo a sorpresa "per il partner" -----------------
    await pageA.goto("/wishlist");
    await pageA.getByRole("button", { name: "Aggiungi alla wishlist" }).click();
    await expect(pageA.getByText("Nuovo desiderio")).toBeVisible();
    await pageA.getByPlaceholder("Titolo (es. Cuffie wireless)").fill(giftTitle);
    await pageA.getByRole("button", { name: "Per il partner", exact: true }).click();
    await pageA.getByText("🎁 Modalità sorpresa", { exact: false }).click();
    await pageA.getByRole("button", { name: "Aggiungi", exact: true }).click();

    // --- 3. A vede subito il proprio item pieno (creatore, mai mascherato) --
    await expect(pageA.getByText(giftTitle)).toBeVisible();
    await expect(pageA.getByText("🎁 sorpresa")).toBeVisible();

    // --- 4. B apre la Wishlist: card presente ma mascherata, NESSUNA fuga ---
    await pageB.goto("/wishlist");
    await expect(pageB.getByText("Sorpresa in arrivo…")).toBeVisible();
    await expect(pageB.getByText(new RegExp(`${partnerAName} sta preparando`))).toBeVisible();
    // Assert negativo esplicito: il titolo reale non deve MAI comparire nel DOM di B
    // finché la sorpresa è attiva — è il cuore di questo scenario.
    await expect(pageB.getByText(giftTitle)).toHaveCount(0);
    // Coerente con la RLS (il partner non può scrivere su una sorpresa attiva
    // non sua): nessun pulsante di completamento sulla card mascherata.
    await expect(pageB.getByRole("button", { name: "Segna come completato" })).toHaveCount(0);

    // --- 5. A segna l'item come completato -----------------------------------
    await pageA.getByRole("button", { name: "Segna come completato" }).click();
    // Sparisce dalla vista "Attivi" di A (spostato in "Completati").
    await expect(pageA.getByText(giftTitle)).toHaveCount(0);
    await pageA.getByRole("button", { name: "Completati 🗂", exact: true }).click();
    await expect(pageA.getByText(giftTitle)).toBeVisible();

    // --- 6. B, dopo un refresh, vede finalmente i dettagli reali -------------
    // Nessun listener Realtime su WishlistView (vedi commento in testa al
    // file): il refresh è il comportamento atteso, non un limite del test.
    await pageB.reload();
    await pageB.getByRole("button", { name: "Completati 🗂", exact: true }).click();
    await expect(pageB.getByText(giftTitle)).toBeVisible();
    await expect(pageB.getByText("Sorpresa in arrivo…")).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

/** Registra un nuovo account e poi effettua il login (stesse credenziali). Stessa funzione di pairing-calendar.spec.ts. */
async function signUpAndLogIn(
  page: Page,
  { name, email, password }: { name: string; email: string; password: string },
) {
  await page.goto("/login");

  await page.getByRole("button", { name: "Registrati", exact: true }).click();
  await page.getByPlaceholder("Come ti chiami?").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByText("Registrazione completata.", { exact: false })).toBeVisible();
  await page.getByPlaceholder("Password").fill(password);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
