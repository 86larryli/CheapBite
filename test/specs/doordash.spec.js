// Deterministic test of the REAL adapters/doordash.js against captured fixture.
// The fixture is the restaurant's JSON-LD Menu wrapped in a <script
// type="application/ld+json"> — that data IS the source, and ld+json scripts
// are inert (not executed), so unlike the Clover/discovery tests we KEEP the
// script rather than stripping it. Network is still blocked → hermetic.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "pho-element-doordash-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "doordash.js");

test.describe("adapters/doordash.js — Pho Element JSON-LD fixture", () => {
  test("reads a plausible {name, price} menu from JSON-LD", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); }); // hermetic
    await page.setContent(fs.readFileSync(FIXTURE, "utf8"), { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.doordash.readMenu(document);
    });

    // 91 raw items across 9 sections, minus "Most Ordered" duplicates.
    expect(items.length).toBeGreaterThanOrEqual(70);
    expect(items.length).toBeLessThanOrEqual(91);

    // De-dup must be effective: no exact name+price appears twice.
    const keys = items.map(function (it) { return it.name + "|" + it.price; });
    expect(new Set(keys).size).toBe(items.length);

    // Every item: non-empty name, finite non-negative price, no '$' leaked in.
    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThanOrEqual(0);
    }

    const byName = function (frag) {
      return items.find(function (it) { return it.name.indexOf(frag) !== -1; });
    };

    // Spot-check prices, and confirm the rating numbers ("• 95% (323)") did
    // NOT contaminate the price.
    const hainan = byName("09 - Hainanese Chicken with Rice");
    expect(hainan && hainan.price).toBe(21.75);

    const imperial = byName("01 - Imperial Roll");
    expect(imperial && imperial.price).toBe(14.5);

    // Sanity: prices look like a real menu.
    const max = Math.max.apply(null, items.map(function (it) { return it.price; }));
    expect(max).toBeLessThan(100);

    // The thesis, in data: DoorDash marks these up vs Clover Direct
    // (Clover: Hainanese $18.95, Imperial Roll $12.50).
    expect(hainan.price).toBeGreaterThan(18.95);
    expect(imperial.price).toBeGreaterThan(12.5);
  });
});
