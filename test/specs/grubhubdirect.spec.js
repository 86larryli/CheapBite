// Deterministic test of adapters/grubhubdirect.js (Grubhub Direct —
// *.dine.online) against a captured fixture (Max's of Burlingame). Grubhub
// Direct is Grubhub's white-label commission-free own-ordering (NOT the
// grubhub.com marketplace). Client-rendered SPA, no JSON-LD, not virtualized →
// the full menu (118 cards) is in the DOM and read in one pass. Hermetic.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "maxs-burlingame-grubhubdirect-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "grubhubdirect.js");

test.describe("adapters/grubhubdirect.js — Max's of Burlingame dine.online fixture", () => {
  test("reads names + base prices (incl. '+' size-option items), skipping the offers carousel", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.grubhubdirect.readMenu(document);
    });
    console.log("GRUBHUB DIRECT ITEMS:", items.length, JSON.stringify(items.slice(0, 5)));

    // 118 cards → ~109 unique after dedup; expect the bulk.
    expect(items.length).toBeGreaterThanOrEqual(100);

    const keys = items.map(function (it) { return it.name; });
    expect(new Set(keys).size).toBe(items.length); // deduped by name

    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);            // name didn't absorb the price
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThan(0);          // promo "$6 off" carousel excluded
      expect(it.price).toBeLessThan(200);
    }

    const byName = function (frag) {
      return items.find(function (it) { return new RegExp(frag, "i").test(it.name); });
    };
    // Plain price.
    const brisket = byName("bbq brisket of beef");
    expect(brisket && brisket.price).toBeCloseTo(27, 2);
    // "$21.00+" size-option item → base price 21, "+" stripped, not dropped.
    const reuben = byName("classic reuben sandwich");
    expect(reuben && reuben.price).toBeCloseTo(21, 2);
  });
});
