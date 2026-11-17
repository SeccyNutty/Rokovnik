import { defineConfig, devices } from "@playwright/test";

/**
 * Testovi u pregledniku (pnpm test:e2e). Sami izgrade i pokrenu aplikaciju na vratima 3210,
 * s praznom ugrađenom bazom u .data/e2e i bez AI-ja (mailovi se čitaju pravilima, pa je ishod
 * uvijek isti i ništa se ne naplaćuje). Prazne vrijednosti ispod namjerno nadjačavaju .env.local:
 * testovi NIKAD ne diraju pravu bazu ni vanjske servise.
 */
const PORT = 3210;
const executablePath = process.env.E2E_CHROMIUM || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    // Priprema: cijeli tok objave i administracija. Ostali projekti koriste podatke koje ona ostavi.
    { name: "tok", testMatch: /01-.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "racunalo", testMatch: /0[2-9]-.*\.spec\.ts/, dependencies: ["tok"], use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobitel", testMatch: /0[2-9]-.*\.spec\.ts/, dependencies: ["tok"], use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node e2e/clean.mjs && pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: "",
      PGLITE_DIR: ".data/e2e/pglite",
      // Vlastiti prostor predmemorije za svako pokretanje: bez ostataka prijašnjih podataka.
      ROKOVNIK_CACHE_NS: `e2e-${Date.now()}`,
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_PROVIDER: "",
      RESEND_API_KEY: "",
      RESEND_WEBHOOK_SECRET: "",
      ADMIN_EMAIL: "",
      FORWARDER_EMAILS: "",
      APP_URL: "",
      INBOUND_ADDRESS: "objavi@test.rokovnik.example",
      INBOUND_SECRET: "e2e-tajna-za-potpis",
      APP_SECRET: "e2e-tajna-za-kolacice-0123456789",
      ADMIN_PASSWORD: "e2e-lozinka",
    },
  },
});
