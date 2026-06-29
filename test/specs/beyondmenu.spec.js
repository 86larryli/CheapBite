// Deterministic test of adapters/beyondmenu.js (BeyondMenu — www.beyondmenu.com)
// against a captured fixture (Spices, San Francisco). BeyondMenu is the
// restaurant's own Direct ordering (carries a flat $0.99 service fee, disclosed
// in the UI — see discovery.js parseServiceFee). Server-rendered, no JSON-LD,
// not virtualized → the full menu (123 items) is in the DOM and read in one
// pass. Hermetic: scripts stripped, network blocked.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "spices-beyondmenu-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "beyondmenu.js");

test.describe("adapters/beyondmenu.js — Spices beyondmenu.com fixture", () => {
  test("reads a bilingual {name, price} menu and strips the spicy icon ligature", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.beyondmenu.readMenu(document);
    });
    console.log("BEYONDMENU ITEMS:", items.length, JSON.stringify(items.slice(0, 5)));

    expect(items.length).toBeGreaterThanOrEqual(100);

    const keys = items.map(function (it) { return it.name; });
    expect(new Set(keys).size).toBe(items.length); // deduped by name

    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);            // name didn't absorb the price
      expect(it.name).not.toMatch(/whatshot/i);     // spicy Material-icon ligature stripped
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThan(0);
      expect(it.price).toBeLessThan(200);
    }

    // Bilingual: most names carry CJK alongside Latin.
    const withCjk = items.filter(function (it) { return /[㐀-鿿]/.test(it.name); });
    expect(withCjk.length).toBeGreaterThan(items.length / 2);

    // A spicy item: name kept (incl. its "A1"/中文) but WITHOUT the icon text.
    const cucumber = items.find(function (it) { return /spicy cucumber/i.test(it.name); });
    expect(cucumber).toBeTruthy();
    expect(cucumber.name).not.toMatch(/whatshot/i);
    expect(cucumber.price).toBeCloseTo(9.99, 2);
  });
});
