// Deterministic test of the REAL adapters/grubhub.js against captured fixture.
// Grubhub has no menu JSON and a virtualized list, so the fixture only holds a
// viewport's worth of rows — enough to validate the EXTRACTION (full name from
// the title attr, "$NN.NN+" price parsing, fee exclusion). The scroll-and-
// accumulate behavior is exercised by the live e2e. Hermetic: scripts stripped,
// network blocked.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "pho-element-grubhub-menu.html");
const FIXTURE_OPEN = path.join(__dirname, "..", "fixtures", "chino-grubhub-open-menu.html");
const FIXTURE_CLOSED = path.join(__dirname, "..", "fixtures", "taste-of-shaxian-grubhub-closed.html");
const ADAPTER = path.join(__dirname, "..", "..", "extension", "adapters", "grubhub.js");

async function loadAdapter(page, fixture) {
  await page.route("**/*", function (route) { return route.abort(); });
  const html = fs.readFileSync(fixture, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
}

test.describe("adapters/grubhub.js — Pho Element fixture", () => {
  test("extracts full names (from title) and base prices", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); }); // hermetic
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(ADAPTER, "utf8"));
    const items = await page.evaluate(function () {
      return window.CheapBiteAdapters.grubhub.readMenu(document);
    });

    expect(items.length).toBeGreaterThanOrEqual(20); // category-rich fixture

    for (const it of items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);
      expect(it.name).not.toMatch(/\.\.\.$/);           // full name, not truncated
      expect(Number.isFinite(it.price)).toBe(true);
      expect(it.price).toBeGreaterThanOrEqual(0); // some items are free (condiments)
      expect(it.price).toBeLessThan(100);
    }

    const byName = function (frag) {
      return items.find(function (it) { return it.name.indexOf(frag) !== -1; });
    };
    // Full multilingual name recovered from the title attribute.
    const hainan = byName("09 - Hainanese Chicken with Rice");
    expect(hainan).toBeTruthy();
    expect(hainan.name).toContain("海南雞飯");          // full title, not the truncated text
    expect(hainan.price).toBe(21.75);

    // "$14.50" with no size suffix.
    const shrimp = byName("03 - Shrimp Spring Roll");
    expect(shrimp && shrimp.price).toBe(14.5);

    // "$20.25+" — the trailing "+" (size options) is stripped to the base price.
    const noodle = byName("18 - Chicken Noodle Soup");
    expect(noodle && noodle.price).toBe(20.25);
  });
});

// Closed-store gate (ADR-0013). A closed restaurant renders the full category
// scaffold but gates the items behind a pickup-time picker, leaving only a thin
// best-sellers preview. We must NOT rank on that biased slice.
test.describe("adapters/grubhub.js — closed-store detection", () => {
  test("OPEN store (Chino Yang's) returns a real menu", async ({ page }) => {
    await loadAdapter(page, FIXTURE_OPEN);
    const out = await page.evaluate(async function () {
      var a = window.CheapBiteAdapters.grubhub;
      return { items: await a.readMenu(document), cats: a.categoryCount(document) };
    });
    // Open: many items relative to its category scaffold → not gated.
    expect(out.cats).toBeGreaterThanOrEqual(6);
    expect(out.items.length).toBeGreaterThanOrEqual(out.cats);
    expect(out.items.length).toBeGreaterThan(20);
    for (const it of out.items) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.name).not.toMatch(/\$/);
      expect(Number.isFinite(it.price)).toBe(true);
    }
  });

  test("CLOSED store (Taste of Sha Xian) is flagged unavailable (empty), not ranked", async ({ page }) => {
    await loadAdapter(page, FIXTURE_CLOSED);
    const out = await page.evaluate(async function () {
      var a = window.CheapBiteAdapters.grubhub;
      return { items: await a.readMenu(document), cats: a.categoryCount(document) };
    });
    // Full scaffold present, but item count below it → gated → []
    expect(out.cats).toBeGreaterThanOrEqual(6);
    expect(out.items.length).toBe(0);
  });

  test("isGatedMenu: gated only when a full scaffold shows too few items", async ({ page }) => {
    await loadAdapter(page, FIXTURE); // any fixture — just need the adapter loaded
    const r = await page.evaluate(function () {
      var g = window.CheapBiteAdapters.grubhub.isGatedMenu;
      return {
        closedReal: g(12, 17),   // Taste of Sha Xian, closed
        openReal: g(169, 18),    // Chino Yang's, open (live full scroll)
        openPho: g(46, 11),      // Pho Element fixture
        smallMenu: g(8, 4),      // genuinely small menu (few cats) — never gated
        edge: g(6, 6)            // equal → not gated (needs strictly fewer)
      };
    });
    expect(r.closedReal).toBe(true);
    expect(r.openReal).toBe(false);
    expect(r.openPho).toBe(false);
    expect(r.smallMenu).toBe(false);
    expect(r.edge).toBe(false);
  });
});
