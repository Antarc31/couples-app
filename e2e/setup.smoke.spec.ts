import { test, expect } from "@playwright/test";

/**
 * Test "smoke" per validare il setup Playwright (avvio dev server +
 * navigazione browser). Non testa una feature dell'app: da sostituire
 * quando le prime schermate reali (auth/home) saranno pronte.
 */
test("l'app risponde e monta il DOM root di Next.js", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
