import { defineConfig, devices } from "@playwright/test";

/**
 * Config Playwright per gli scenari e2e di couples-app.
 * Vedi docs/PLAN.md per lo scenario Fase 1: due partner accoppiati,
 * A crea un evento calendario, B lo vede sincronizzato in realtime.
 *
 * Nota ambiente: gli scenari che richiedono Supabase Realtime completo
 * potrebbero risultare `test.skip()` in sandbox senza un'istanza Supabase
 * locale raggiungibile — vedi commenti nei singoli file in e2e/.
 */
export default defineConfig({
  testDir: "./e2e",
  // Default 30s è troppo stretto per uno scenario con due signup reali +
  // più round-trip RPC/RLS contro un progetto Supabase cloud (non locale).
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
