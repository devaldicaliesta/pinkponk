import { defineConfig, devices } from "@playwright/test";

const chromiumPath = process.env.PW_CHROMIUM;
// WebGL perangkat lunak agar Three.js jalan di CI tanpa GPU.
const launchOptions = {
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command:
      "pnpm --filter @pinkponk/web build:e2e && pnpm --filter @pinkponk/worker exec wrangler dev --port 8787",
    url: "http://localhost:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
