// Deterministic test of adapters/hungrypanda.js (HungryPanda / usa.hungrypanda.co)
// against a captured fixture (Taste of Sha Xian, San Mateo). HungryPanda is an
// Asian-food aggregator with no menu JSON-LD and a non-virtualized DOM, so the
// fixture holds the full menu (206 cards across categories → 192 unique dishes)
// and the adapter reads it in one pass. Hermetic: scripts stripped, network
// blocked. Unlike Fantuan, there is no Rewards section and no multi-price
// discount layout — one clean price per item.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "taste-of-shaxian-hungrypanda-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "hungrypanda.js");

test.describe("adapters/hungrypanda.js — Taste of Sha Xian usa.hungrypanda.co fixture", () => {
  test("reads a bilingual {name, price} menu, deduped across categories", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.hungrypanda.readMenu(document);
    });
    console.log("HUNGRYPANDA ITEMS:", JSON.stringify(items.slice(0, 6)));

    // 206 cards collapse to ~192 unique dishes (some repeat across categories).
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
    const max = Math.max.apply(null, items.map(function (it) { return it.price; }));
    expect(max).toBeGreaterThan(10);

    // Bilingual: most names carry CJK alongside Latin.
    const withCjk = items.filter(function (it) { return /[㐀-鿿]/.test(it.name); });
    expect(withCjk.length).toBeGreaterThan(items.length / 2);

    // Spot-check exact prices (single clean price per item).
    const byName = function (frag) {
      return items.find(function (it) { return new RegExp(frag, "i").test(it.name); });
    };
    const crab = byName("crab roe noodles");
    expect(crab && crab.price).toBeCloseTo(20.98, 2);
    const beef = byName("steamed beef dumplings");
    expect(beef && beef.price).toBeCloseTo(13.98, 2);
  });
});
