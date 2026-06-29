// Deterministic test of adapters/fantuan.js (Fantuan / fantuanorder.com) against
// a captured fixture (Taste of Sha Xian, San Mateo). Fantuan is an Asian-food
// aggregator with no usable menu JSON-LD and a non-virtualized DOM, so the
// fixture holds the full menu (66 cards: 5 Rewards + 61 normal) and the adapter
// reads it in one pass. Hermetic: scripts stripped, network blocked.
//
// Pricing rules under test (from the builder's live testing):
//   1. Rewards-section items (points-redeemable) are EXCLUDED.
//   2. For every other item we take the BLACK discounted price — not the
//      struck-through original (higher) and not the red "after coupon" price
//      (lower, needs a coupon).
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "taste-of-shaxian-fantuan-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "fantuan.js");

test.describe("adapters/fantuan.js — Taste of Sha Xian fantuanorder.com fixture", () => {
  test("excludes Rewards and takes the black (no-terms) discounted price", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.fantuan.readMenu(document);
    });
    console.log("FANTUAN ITEMS:", JSON.stringify(items.slice(0, 6)));

    // 66 cards minus the 5 Rewards items → ~61 (a few may dedupe by name).
    expect(items.length).toBeGreaterThanOrEqual(55);
    expect(items.length).toBeLessThanOrEqual(62);

    const keys = items.map(function (it) { return it.name; });
    expect(new Set(keys).size).toBe(items.length); // deduped by name

    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);            // name didn't absorb the price
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThan(0);          // no Rewards $0 leaked through
      expect(it.price).toBeLessThan(200);
    }

    // Bilingual: most names carry CJK (the Chinese name) alongside Latin.
    const withCjk = items.filter(function (it) { return /[㐀-鿿]/.test(it.name); });
    expect(withCjk.length).toBeGreaterThan(items.length / 2);

    const byName = function (frag) {
      return items.find(function (it) { return new RegExp(frag, "i").test(it.name); });
    };

    // Black price, NOT the struck-through original, NOT the red coupon.
    //   Crab Roe Noodles: black $18.46 | struck $20.98 | coupon $15.83
    const crab = byName("crab roe noodles");
    expect(crab).toBeTruthy();
    expect(crab.price).toBeCloseTo(18.46, 2);
    //   Steamed Beef Dumplings: black $12.30 | struck $13.98 | coupon $9.88
    const beef = byName("steamed beef dumplings");
    expect(beef).toBeTruthy();
    expect(beef.price).toBeCloseTo(12.3, 2);
    //   Fish Ball Soup: black $11.42 | struck $12.98
    const fishball = byName("fish ball soup");
    expect(fishball).toBeTruthy();
    expect(fishball.price).toBeCloseTo(11.42, 2);

    // A dish that exists in BOTH Rewards (points, $0) and a real category:
    // the real black price must win, never the $0 Rewards card.
    const porkBuns = byName("pan fried sha xian pork buns");
    expect(porkBuns).toBeTruthy();
    expect(porkBuns.price).toBeCloseTo(11.42, 2);
  });
});
