// Deterministic test of adapters/chownow.js (ChowNow — direct.chownow.com /
// www.chownow.com) against a captured fixture (Max's of Burlingame). ChowNow is
// the restaurant's own commission-free Direct ordering; "ChowNow" and "ChowNow
// Local" are the same app, so this one adapter covers both. Client-rendered SPA,
// no JSON-LD, not virtualized → the full menu (110 items) is in the DOM and read
// in one pass. Hermetic: scripts stripped, network blocked.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "maxs-burlingame-chownow-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "chownow.js");

test.describe("adapters/chownow.js — Max's of Burlingame chownow.com fixture", () => {
  test("reads a plausible {name, price} menu from the DOM", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.chownow.readMenu(document);
    });
    console.log("CHOWNOW ITEMS:", items.length, JSON.stringify(items.slice(0, 5)));

    expect(items.length).toBeGreaterThanOrEqual(90);

    const keys = items.map(function (it) { return it.name; });
    expect(new Set(keys).size).toBe(items.length); // deduped by name

    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);            // name didn't absorb the price
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThan(0);
      expect(it.price).toBeLessThan(200);
    }
    const max = Math.max.apply(null, items.map(function (it) { return it.price; }));
    expect(max).toBeGreaterThan(10);

    // Spot-check known items + prices.
    const byName = function (frag) {
      return items.find(function (it) { return new RegExp(frag, "i").test(it.name); });
    };
    const soup = byName("matzoh ball soup");
    expect(soup && soup.price).toBeCloseTo(10.99, 2);
    const reuben = byName("classic reuben sandwich");
    expect(reuben && reuben.price).toBeCloseTo(24.99, 2);
  });
});
