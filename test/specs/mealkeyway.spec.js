// Deterministic test of adapters/mealkeyway.js (MealKeyway / MenuSifu —
// order.mealkeyway.com) against a captured fixture (Top SF BBQ, San Francisco).
// MealKeyway is the restaurant's own commission-free Direct ordering (the
// "Preferred by business" row). It's a client-rendered SPA with no JSON-LD and
// the full menu rendered at once (not virtualized), so the fixture holds the
// whole menu (202 cards) and the adapter reads it in one pass. Hermetic:
// scripts stripped, network blocked.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "top-sf-bbq-mealkeyway-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "mealkeyway.js");

test.describe("adapters/mealkeyway.js — Top SF BBQ order.mealkeyway.com fixture", () => {
  test("reads a plausible {name, price} menu from the DOM", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.mealkeyway.readMenu(document);
    });
    console.log("MEALKEYWAY ITEMS:", items.length, JSON.stringify(items.slice(0, 5)));

    // The fixture is a full menu — expect the bulk of its ~202 cards.
    expect(items.length).toBeGreaterThanOrEqual(150);

    const keys = items.map(function (it) { return it.name; });
    expect(new Set(keys).size).toBe(items.length); // deduped by name

    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);            // name didn't absorb the price
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThanOrEqual(0);
      expect(it.price).toBeLessThan(200);
    }
    // Prices span a plausible menu range.
    const max = Math.max.apply(null, items.map(function (it) { return it.price; }));
    expect(max).toBeGreaterThan(10);

    // Spot-check a couple of known items + prices.
    const byName = function (frag) {
      return items.find(function (it) { return new RegExp(frag, "i").test(it.name); });
    };
    const beef = byName("^beef skewer$");
    expect(beef && beef.price).toBeCloseTo(2.99, 2);
    const ribs = byName("spare ribs skewer");
    expect(ribs && ribs.price).toBeCloseTo(3.99, 2);
  });
});
