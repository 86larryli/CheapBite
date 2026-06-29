// Integration test of the REAL discovery.js + families.js against the captured
// Top SF BBQ searchviewer fixture. This store is a good wiring case for the new
// MealKeyway Direct backend: it lists MealKeyway (order.mealkeyway.com, marked
// "Preferred by business") alongside a DoorDash Storefront (order.online, also
// Direct) and the aggregators Fantuan / HungryPanda / DoorDash / Grubhub /
// Uber Eats. Proves (1) order.mealkeyway.com classifies as the MealKeyway Direct
// backend and wins as the preferred baseline, (2) planGather routes it to the
// mealkeyway adapter, and (3) the full gather set is correct. Hermetic.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "top-sf-bbq-searchviewer.html");
const DISCOVERY = path.join(__dirname, "..", "..", "extension", "discovery.js");
const FAMILIES = path.join(__dirname, "..", "..", "extension", "families.js");

test.describe("discovery + families — Top SF BBQ (MealKeyway Direct)", () => {
  test("MealKeyway is the preferred Direct baseline and routes to the mealkeyway adapter", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(DISCOVERY, "utf8"));
    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(FAMILIES, "utf8"));

    const out = await page.evaluate(function () {
      var d = window.CheapBiteDiscovery.discoverChannels(document);
      return { discovery: d, plan: window.CheapBiteFamilies.planGather(d) };
    });

    // --- Discovery: MealKeyway recognised as a preferred Direct backend. ---
    const mk = out.discovery.directCandidates.find(function (c) { return c.host === "order.mealkeyway.com"; });
    expect(mk).toBeTruthy();
    expect(mk.backend).toBe("MealKeyway");
    expect(mk.preferred).toBe(true);
    // It wins as the primary Direct baseline over the (non-preferred) Storefront.
    expect(out.discovery.direct && out.discovery.direct.host).toBe("order.mealkeyway.com");

    // --- Plan: MealKeyway is a Direct gather job on the mealkeyway adapter. ---
    const mkJob = out.plan.jobs.find(function (j) { return j.adapter === "mealkeyway"; });
    expect(mkJob).toBeTruthy();
    expect(mkJob.isDirect).toBe(true);
    expect(mkJob.backend).toBe("MealKeyway");
    expect(mkJob.key).toBe("Direct · MealKeyway");

    // Full gather set: both Direct backends + one canonical aggregator per family.
    const adapters = out.plan.jobs.map(function (j) { return j.adapter; }).sort();
    expect(adapters).toEqual(
      ["doordash", "fantuan", "grubhub", "hungrypanda", "mealkeyway", "storefront", "ubereats"]
    );

    // None of the supported channels are flagged unsupported.
    const unsupportedKeys = out.plan.unsupported.map(function (u) { return u.key; });
    expect(unsupportedKeys).not.toContain("MealKeyway");
    expect(unsupportedKeys).not.toContain("Fantuan");
    expect(unsupportedKeys).not.toContain("HungryPanda");
  });
});
