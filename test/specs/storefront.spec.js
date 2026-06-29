// Deterministic test of adapters/storefront.js (DoorDash Storefront / order.online)
// against a captured fixture (Pacific Catch). order.online is virtualized with
// no JSON-LD, so the fixture holds a viewport's worth of cards — enough to
// validate extraction (name + "$NN.NN+" price from the card's leaf spans).
// Hermetic: scripts stripped, network blocked.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "pacific-catch-storefront-menu.html");
const FIXTURE_GENERIC = path.join(__dirname, "..", "fixtures", "taste-of-shaxian-storefront-menu.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "storefront.js");

async function readFixture(page, fixture) {
  await page.route("**/*", function (route) { return route.abort(); });
  const html = fs.readFileSync(fixture, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
  return page.evaluate(function () { return window.CheapBiteAdapters.storefront.readMenu(document); });
}

function assertPlausibleMenu(items, minCount) {
  expect(items.length).toBeGreaterThanOrEqual(minCount);
  const keys = items.map(function (it) { return it.name; });
  expect(new Set(keys).size).toBe(items.length); // deduped
  for (const it of items) {
    expect(it.name.length).toBeGreaterThan(0);
    expect(it.name).not.toMatch(/\$/);           // name didn't absorb the price
    expect(Number.isFinite(it.price)).toBe(true);
    expect(it.price).toBeGreaterThanOrEqual(0);
    expect(it.price).toBeLessThan(200);
  }
  const max = Math.max.apply(null, items.map(function (it) { return it.price; }));
  expect(max).toBeGreaterThan(10);
}

test.describe("adapters/storefront.js", () => {
  // Current layout: GenericItemCard / StoreMenuItemPrice (Taste of Sha Xian).
  // This is what most order.online stores serve now; image-action-card cards
  // here are only the "Featured / Most Ordered" carousel, which we must skip.
  test("current layout — reads GenericItemCard names + prices, skipping the featured carousel", async ({ page }) => {
    const items = await readFixture(page, FIXTURE_GENERIC);
    console.log("STOREFRONT (generic) ITEMS:", JSON.stringify(items.slice(0, 6)));
    assertPlausibleMenu(items, 10);
    // Names are bilingual on this store (EN + 中文) — the h3 keeps both scripts.
    const withCjk = items.filter(function (it) { return /[㐀-鿿]/.test(it.name); });
    expect(withCjk.length).toBeGreaterThan(items.length / 2);
  });

  // Legacy layout fallback: image-action-card-container leaf spans (Pacific Catch).
  test("legacy layout — falls back to image-action-card leaf spans", async ({ page }) => {
    const items = await readFixture(page, FIXTURE);
    console.log("STOREFRONT (legacy) ITEMS:", JSON.stringify(items.slice(0, 8)));
    assertPlausibleMenu(items, 10);
  });
});
