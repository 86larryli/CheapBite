// Deterministic test of the REAL adapters/toast.js against a captured fixture
// (Kajiken, San Mateo). Toast's menu is in the DOM (its JSON-LD is an empty
// stub) and not virtualized, so a single read sees the whole menu. Hermetic:
// scripts stripped, network blocked.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "kajiken-toast-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "toast.js");

test.describe("adapters/toast.js — Kajiken fixture", () => {
  test("reads a plausible {name, price} menu from the DOM", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.toast.readMenu(document);
    });

    expect(items.length).toBeGreaterThanOrEqual(15);

    // Unique names; clean records.
    const keys = items.map(function (it) { return it.name; });
    expect(new Set(keys).size).toBe(items.length); // deduped (Featured repeats)
    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThanOrEqual(0);
      expect(it.price).toBeLessThan(200);
    }

    const byName = function (frag) {
      return items.find(function (it) { return it.name.indexOf(frag) !== -1; });
    };
    expect((byName("NIKUMORI ABURASOBA") || {}).price).toBe(19.5);
    expect((byName("HOMURA ABURASOBA") || {}).price).toBe(18.5);
    expect((byName("WAGYU ROAST BEEF ABURASOBA") || {}).price).toBe(26.5);
  });
});
