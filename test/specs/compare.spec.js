// End-to-end (hermetic) test of Phase 1c: run the REAL Clover + DoorDash
// adapters against their captured fixtures, then run the REAL compare module
// to produce a Clover-Direct → DoorDash Upcharge. Proves the whole pipeline
// (read → match → estimate) on real data, with no network.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIX = path.join(__dirname, "..", "fixtures");
const EXT = path.join(__dirname, "..", "..", "extension");
const read = (p) => fs.readFileSync(p, "utf8");

async function menuFrom(page, fixture, adapterFile, adapterName, stripScripts) {
  let html = read(path.join(FIX, fixture));
  if (stripScripts) html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => window.eval(s), read(path.join(EXT, "adapters", adapterFile)));
  return page.evaluate((n) => window.CheapBiteAdapters[n].readMenu(document), adapterName);
}

test("Clover Direct → DoorDash Upcharge on real Pho Element menus", async ({ page }) => {
  await page.route("**/*", (route) => route.abort()); // hermetic

  // Clover = Baseline (Direct); strip its executable scripts (data is in DOM).
  const clover = await menuFrom(page, "pho-element-clover-menu.html", "clover.js", "clover", true);
  // DoorDash = target; keep scripts (data is the inert ld+json).
  const doordash = await menuFrom(page, "pho-element-doordash-menu.html", "doordash.js", "doordash", false);

  expect(clover.length).toBeGreaterThan(80);
  expect(doordash.length).toBeGreaterThan(60);

  await page.evaluate((s) => window.eval(s), read(path.join(EXT, "compare.js")));
  const results = await page.evaluate(
    (args) => window.CheapBiteCompare.compare(args.baseline, args.channels),
    { baseline: clover, channels: [{ key: "DoorDash", menu: doordash }] }
  );

  const dd = results[0];
  console.log("UPCHARGE RESULT:", JSON.stringify(dd, null, 2));

  // A healthy number of items matched across the two real menus.
  expect(dd.matchCount).toBeGreaterThanOrEqual(20);
  expect(dd.summary.n).toBeGreaterThanOrEqual(20);

  // DoorDash is consistently pricier than ordering direct, ~15%.
  expect(dd.summary.consistent).toBe(true);
  expect(dd.summary.medianPct).toBeGreaterThan(8);
  expect(dd.summary.medianPct).toBeLessThan(25);

  // IQR range is ordered and brackets the median sensibly.
  expect(dd.summary.lowPct).toBeLessThanOrEqual(dd.summary.medianPct);
  expect(dd.summary.highPct).toBeGreaterThanOrEqual(dd.summary.medianPct);

  // Evidence rows carry both prices, baseline < target (markup), and no '$'.
  expect(dd.evidence.length).toBeGreaterThan(0);
  for (const e of dd.evidence) {
    expect(typeof e.baselinePrice).toBe("number");
    expect(typeof e.targetPrice).toBe("number");
  }
});

test("matching is precise: no false match for a fragment collision", async ({ page }) => {
  await page.evaluate(() => {}); // ensure a page context
  await page.setContent("<!doctype html><body></body>", { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => window.eval(s), read(path.join(EXT, "compare.js")));

  // "Wine Sauce Oxtail with Rice" must NOT match the plain add-on
  // "Wine Sauce Oxtail" at the confident threshold.
  const m = await page.evaluate(() => {
    const C = window.CheapBiteCompare;
    return {
      sameDish: C.similarity(
        "14 - Wine Sauce Oxtail with Rice - 法式牛尾飯",
        "14 - Wine Sauce Oxtail with Rice - 法式牛尾飯"
      ),
      diffDish: C.similarity(
        "14 - Wine Sauce Oxtail with Rice - 法式牛尾飯",
        "28 - Wine Sauce Oxtail Noodle Soup - 法式牛尾湯粉"
      )
    };
  });
  expect(m.sameDish).toBe(1);
  expect(m.diffDish).toBeLessThan(0.85); // distinct dishes stay below threshold
});

// Per-script (multilingual) matching: the same dish is written with different
// language slices across platforms (Direct carries EN + 中文; Grubhub carries
// EN only; some carry 中文 only). Scoring each shared script in isolation and
// keeping the best recovers matches the mixed-string score diluted below 0.85,
// WITHOUT inventing matches between items that share no script.
test("per-script matching recovers bilingual matches without false positives", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>", { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => window.eval(s), read(path.join(EXT, "compare.js")));

  const r = await page.evaluate(() => {
    const C = window.CheapBiteCompare;
    return {
      // EN + 中文 vs EN-only: the orphaned Chinese must not block the match.
      enSlice: C.similarity("Pork Mu Shu 木须肉", "Pork Mu Shu"),
      // count moved to the front + dropped plural — Latin segment still aligns.
      reordered: C.similarity("Vegetable Spring Rolls (3) 素菜春卷", "3 Vegetable Spring Rolls"),
      // English names diverge by translation, but the shared 中文 bridges them.
      cjkBridge: C.similarity("辣子鸡 Chili dry fried Chicken", "Fire Cracker Chicken 辣子鸡"),
      // No shared script at all → must stay far below threshold (no guessing).
      noShared: C.similarity("Mongolian Beef", "红烧牛肉"),
      // Two different pure-CJK dishes share only a "(大)" size marker — the
      // leftover "()" Latin must NOT count as a match.
      stray: C.similarity("红烧牛肉 (大)", "宫保鸡丁 (大)")
    };
  });

  expect(r.enSlice).toBeGreaterThanOrEqual(0.85);   // recovered (was ~0.84 mixed)
  expect(r.reordered).toBeGreaterThanOrEqual(0.85); // recovered
  expect(r.cjkBridge).toBeGreaterThanOrEqual(0.85); // recovered via shared CJK
  expect(r.noShared).toBeLessThan(0.5);             // no cross-script false match
  expect(r.stray).toBeLessThan(0.85);               // stray "()" doesn't bridge
});

// rankByCheapest (ADR-0013): rank all gathered Channels vs the cheapest, with
// Direct preferred-but-not-required. Uses all four real Pho Element menus.
test.describe("rankByCheapest — Direct preferred, not required", () => {
  async function allMenus(page) {
    const clover = await menuFrom(page, "pho-element-clover-menu.html", "clover.js", "clover", true);
    const doordash = await menuFrom(page, "pho-element-doordash-menu.html", "doordash.js", "doordash", false);
    const ubereats = await menuFrom(page, "pho-element-ubereats-menu.html", "ubereats.js", "ubereats", false);
    const grubhub = await menuFrom(page, "pho-element-grubhub-menu.html", "grubhub.js", "grubhub", true);
    await page.evaluate((s) => window.eval(s), read(path.join(EXT, "compare.js")));
    return { clover, doordash, ubereats, grubhub };
  }
  const rank = (page, channels) =>
    page.evaluate((ch) => window.CheapBiteCompare.rankByCheapest(ch), channels);

  test("Direct (Clover) is the cheapest baseline; aggregators ~+15%", async ({ page }) => {
    await page.route("**/*", (route) => route.abort());
    const m = await allMenus(page);
    const res = await rank(page, [
      { key: "Clover", isDirect: true, backend: "Clover", menu: m.clover },
      { key: "DoorDash", menu: m.doordash },
      { key: "Uber Eats", menu: m.ubereats },
      { key: "Grubhub", menu: m.grubhub }
    ]);

    expect(res.baselineKey).toBe("Clover");
    expect(res.baselineIsDirect).toBe(true);
    const base = res.ranked.find((r) => r.isBaseline);
    expect(base.key).toBe("Clover");
    expect(base.summary.medianPct).toBe(0);
    // Each aggregator marked up ~+15% vs Direct.
    res.ranked.filter((r) => !r.isBaseline).forEach((r) => {
      expect(r.summary.medianPct).toBeGreaterThan(8);
      expect(r.summary.medianPct).toBeLessThan(25);
    });
  });

  test("ties: identically-priced channels are marked tied, pricier ones are not", async ({ page }) => {
    await page.route("**/*", (route) => route.abort());
    await page.setContent("<!doctype html><body></body>", { waitUntil: "domcontentloaded" });
    await page.evaluate((s) => window.eval(s), read(path.join(EXT, "compare.js")));
    const res = await page.evaluate(() => {
      const a = [{ name: "Burger", price: 10 }, { name: "Fries", price: 5 }];
      const b = [{ name: "Burger", price: 10 }, { name: "Fries", price: 5 }];   // same as A
      const c = [{ name: "Burger", price: 12 }, { name: "Fries", price: 6 }];   // +20%
      return window.CheapBiteCompare.rankByCheapest([
        { key: "A", menu: a }, { key: "B", menu: b }, { key: "C", menu: c }
      ]);
    });
    const byKey = Object.fromEntries(res.ranked.map((r) => [r.key, r]));
    expect(byKey.A.tied).toBe(true);   // baseline
    expect(byKey.B.tied).toBe(true);   // identical price → tied
    expect(byKey.C.tied).toBe(false);  // clearly pricier
    expect(byKey.C.summary.medianPct).toBeGreaterThan(15);
  });

  test("degrades when no Direct: cheapest aggregator becomes baseline, others small", async ({ page }) => {
    await page.route("**/*", (route) => route.abort());
    const m = await allMenus(page);
    // Simulate an unsupported Direct backend (e.g. Toast) — Clover excluded.
    const res = await rank(page, [
      { key: "DoorDash", menu: m.doordash },
      { key: "Uber Eats", menu: m.ubereats },
      { key: "Grubhub", menu: m.grubhub }
    ]);

    expect(res.baselineKey).toBeTruthy();
    expect(res.baselineIsDirect).toBe(false);
    expect(res.ranked.length).toBe(3);
    const base = res.ranked.find((r) => r.isBaseline);
    expect(base.summary.medianPct).toBe(0);
    // The aggregators price alike, so upcharges vs the cheapest are small & non-negative.
    res.ranked.filter((r) => !r.isBaseline).forEach((r) => {
      expect(r.summary.medianPct).toBeGreaterThanOrEqual(0);
      expect(r.summary.medianPct).toBeLessThan(10);
    });
  });
});
