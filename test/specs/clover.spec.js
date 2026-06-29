// Deterministic test of the REAL adapters/clover.js against captured fixture
// HTML. Hermetic: network blocked and the fixture's own <script>s stripped, so
// it never touches Clover and never flakes. Validates menu parsing, not a live
// site.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "pho-element-clover-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "clover.js");

test.describe("adapters/clover.js — Pho Element menu fixture", () => {
  test("reads a plausible {name, price} menu", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); }); // hermetic
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.clover.readMenu(document);
    });

    // The captured menu has ~106 priced rows.
    expect(items.length).toBeGreaterThanOrEqual(100);

    // Every item: non-empty name and a finite, non-negative price.
    for (const it of items) {
      expect(typeof it.name).toBe("string");
      expect(it.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThanOrEqual(0);
    }

    // Names must NOT swallow the price or the separate description sibling.
    const byName = function (frag) {
      return items.find(function (it) { return it.name.indexOf(frag) !== -1; });
    };
    const imperial = byName("Imperial Roll");
    expect(imperial).toBeTruthy();
    expect(imperial.price).toBe(12.5);
    expect(imperial.name).not.toMatch(/\$/);

    const hainan = byName("Hainanese Chicken with Rice");
    expect(hainan && hainan.price).toBe(18.95);

    // Spot-check a distinctive main from a later category. Use the full name —
    // "Wine Sauce Oxtail" alone matches three items (with Rice, Noodle Soup, and
    // a plain add-on), which is exactly why Phase 1c matching needs full names.
    const oxtail = byName("14 - Wine Sauce Oxtail with Rice");
    expect(oxtail && oxtail.price).toBe(21.95);

    // Prices look like a real menu (most mains in a sane range).
    const priced = items.filter(function (it) { return it.price > 0; });
    expect(priced.length).toBeGreaterThan(80);
    const max = Math.max.apply(null, priced.map(function (it) { return it.price; }));
    expect(max).toBeLessThan(100);
  });
});
