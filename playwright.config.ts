import { defineConfig, devices } from "@playwright/test";

/**
 * Testovi u pregledniku (pnpm test:e2e). Sami izgrade i pokrenu aplikaciju na vratima 3210,
 * s praznom ugrađenom bazom u .data/e2e i bez AI-ja (mailovi se čitaju pravilima, pa je ishod
 * uvijek isti i ništa se ne naplaćuje). Prazne vrijednosti ispod namjerno nadjačavaju .env.local:
 * testovi NIKAD ne diraju pravu bazu ni vanjske servise.
 */
const PORT = 3210;
const OIDC_PORT = 3299;
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
  webServer: [
    {
      // Lažni Google za testove prijave (samo lokalno; aplikacija ga na hostingu ne prihvaća).
      command: `node e2e/oidc-mock.mjs`,
      url: `http://127.0.0.1:${OIDC_PORT}/jwks`,
      env: { OIDC_PORT: String(OIDC_PORT) },
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
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
      OIDC_TEST_ISSUER: `http://127.0.0.1:${OIDC_PORT}`,
      GOOGLE_CLIENT_ID: "e2e-klijent",
      GOOGLE_CLIENT_SECRET: "e2e-tajna-klijenta",
      ADMIN_EMAILS: "admin@e2e.example",
      FEEDBACK_EMAILS: "off",
      // Testovi se prijavljuju desetke puta u minuti; ograničenja ostaju, ali šira.
      RATE_LIMIT_MULTIPLIER: "20",
    },
    },
  ],
});
