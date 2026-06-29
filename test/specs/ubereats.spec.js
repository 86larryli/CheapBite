// Deterministic test of the REAL adapters/ubereats.js against captured fixture.
// The fixture is the restaurant's Restaurant JSON-LD (menu nested under
// hasMenu) in an inert <script type="application/ld+json">, so — like the
// DoorDash test — we KEEP the script and only block the network.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "pho-element-ubereats-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "ubereats.js");

test.describe("adapters/ubereats.js — Pho Element JSON-LD fixture", () => {
  test("reads a plausible {name, price} menu from nested JSON-LD", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); }); // hermetic
    await page.setContent(fs.readFileSync(FIXTURE, "utf8"), { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.ubereats.readMenu(document);
    });

    expect(items.length).toBeGreaterThanOrEqual(70);
    expect(items.length).toBeLessThanOrEqual(99);

    // De-dup effective; clean records.
    const keys = items.map(function (it) { return it.name + "|" + it.price; });
    expect(new Set(keys).size).toBe(items.length);
    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThanOrEqual(0);
    }

    const byName = function (frag) {
      return items.find(function (it) { return it.name.indexOf(frag) !== -1; });
    };
    // Bare-number price ("14.50") parsed correctly.
    const imperial = byName("01 - Imperial Roll");
    expect(imperial && imperial.price).toBe(14.5);
    const hainan = byName("09 - Hainanese Chicken with Rice");
    expect(hainan && hainan.price).toBe(21.75);

    const max = Math.max.apply(null, items.map(function (it) { return it.price; }));
    expect(max).toBeLessThan(100);
  });
});
