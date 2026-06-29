// Deterministic test of adapters/chowbus.js (Chowbus POS / pos.chowbus.com).
//
// The adapter parses the page's embedded Next.js Flight (RSC) data rather than
// scraping DOM cards, because a store can have multiple menus and the DOM only
// renders one at a time (and the menu switcher can't be driven by injected
// events in the gather). The fixtures therefore preserve the `__next_f` data
// scripts (neutralized to type="text/plain" so they don't execute) instead of
// the rendered meal DOM. Hermetic: network blocked, scripts inert.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIX = path.join(__dirname, "..", "fixtures");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "chowbus.js");

async function readMenu(page, fixture) {
  await page.route("**/*", function (route) { return route.abort(); });
  const html = fs.readFileSync(path.join(FIX, fixture), "utf8");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
  return page.evaluate(function () { return window.CheapBiteAdapters.chowbus.readMenu(document); });
}

function assertPlausibleBilingualMenu(items, minCount) {
  expect(items.length).toBeGreaterThanOrEqual(minCount);
  expect(new Set(items.map(function (it) { return it.name; })).size).toBe(items.length); // deduped
  for (const it of items) {
    expect(it.name.length).toBeGreaterThan(0);
    expect(it.name).not.toMatch(/\$/);
    expect(Number.isFinite(it.price)).toBe(true);
    expect(it.price).toBeGreaterThan(0);
    expect(it.price).toBeLessThan(300);
  }
  // Bilingual: most names carry CJK alongside Latin.
  const withCjk = items.filter(function (it) { return /[㐀-鿿]/.test(it.name); });
  expect(withCjk.length).toBeGreaterThan(items.length / 2);
}

test.describe("adapters/chowbus.js — embedded Flight data", () => {
  // Single menu, but with the membership/points (crown) discount.
  test("Taste of Sha Xian — full menu, regular price (ignores the points/crown discount)", async ({ page }) => {
    const items = await readMenu(page, "taste-of-shaxian-chowbus-flight.html");
    console.log("CHOWBUS (Taste of Sha Xian):", items.length, "items;", JSON.stringify(items.slice(0, 4)));
    assertPlausibleBilingualMenu(items, 180);

    // Crown/points discount must be ignored: "shaxian wonton soup" shows
    // menu_price 8.98 and member_price 5.98 — we take the regular 8.98.
    const wonton = items.find(function (it) { return /shaxian wonton soup/i.test(it.name); });
    expect(wonton).toBeTruthy();
    expect(wonton.price).toBeCloseTo(8.98, 2); // regular, NOT the crown 5.98
  });

  // Multiple menus (Hot Pot / Sichuan Style / Barbecue) — the case the DOM scrape
  // could not handle (it saw only the ~11 active-menu items). Parsing the
  // embedded data yields all menus at once, including ones closed right now.
  test("Chef Xiong — captures items from ALL menus, not just the active one", async ({ page }) => {
    const items = await readMenu(page, "chef-xiong-chowbus-flight.html");
    console.log("CHOWBUS (Chef Xiong):", items.length, "items;", JSON.stringify(items.slice(0, 4)));
    // Far more than the ~11 the active-menu DOM would expose.
    assertPlausibleBilingualMenu(items, 130);

    const byName = function (frag) {
      return items.find(function (it) { return new RegExp(frag, "i").test(it.name); });
    };
    // An item from the Hot Pot menu AND one from the Sichuan menu both present →
    // proves cross-menu coverage.
    const hotpot = byName("mongolian lamb back bone pot");
    expect(hotpot).toBeTruthy();
    expect(hotpot.price).toBeCloseTo(35.99, 2);
    const sichuan = byName("fresh pepper pig ears");
    expect(sichuan).toBeTruthy();
    expect(sichuan.price).toBeCloseTo(12.99, 2);
  });
});
