// Flat ESLint config for CheapBite (plain JS, no build step).
// The code runs in three different contexts, each with its own globals:
//   • extension/** — content scripts + page-injected adapters (browser DOM + the
//     extension APIs). Loaded as classic scripts (no ES modules).
//   • extension/background.js — MV3 service worker.
//   • test/**, *.config.js — Node + Playwright.
"use strict";

const js = require("@eslint/js");
const globals = require("globals");

// Shared rule tweaks: the codebase uses intentional empty catch blocks for
// best-effort cleanup, and callback signatures with unused trailing args.
const rules = {
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
};

module.exports = [
  { ignores: ["node_modules/", "dist/", "test-results/", "playwright-report/", "coverage/", "test/fixtures/"] },

  js.configs.recommended,

  // Extension source: content scripts + page-injected adapters (browser context).
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules,
  },

  // Service worker context.
  {
    files: ["extension/background.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.serviceworker, ...globals.webextensions },
    },
    rules,
  },

  // Node + Playwright (tests, config). Specs also embed browser-context
  // callbacks (page.evaluate(() => … window … document …)) that ESLint parses
  // as part of the file, so browser globals are included here too.
  {
    files: ["test/**/*.js", "tools/**/*.js", "*.config.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    rules,
  },
];
