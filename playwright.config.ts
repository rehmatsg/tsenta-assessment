import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  webServer: {
    command: "npm run serve",
    url: "http://localhost:3939",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
