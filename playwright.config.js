// Playwright config for CheapBite tests.
//   npm test            → all tests
//   npm run test:unit   → deterministic fixture tests (fast, hermetic)
//   npm run test:e2e    → live extension E2E against Google Maps (headed, flaky)
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/specs",
  timeout: 90_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: { headless: true }
});
