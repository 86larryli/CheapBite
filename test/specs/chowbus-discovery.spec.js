// Integration test of the REAL discovery.js + families.js against the captured
// Taste of Sha Xian searchviewer fixture. This store is the wiring stress case
// for the Chowbus backend: it lists TWO Direct candidates (Chowbus POS, marked
// "Preferred by business", and DoorDash Storefront) plus Fantuan and HungryPanda.
// It proves (1) pos.chowbus.com classifies as the Chowbus Direct backend and
// becomes the preferred baseline, (2) planGather routes it to the chowbus
// adapter, and (3) the still-unsupported Asian aggregator (Fantuan) is flagged,
// not gathered. Hermetic: network blocked, fixture scripts stripped.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "taste-of-shaxian-searchviewer.html");
const DISCOVERY = path.join(__dirname, "..", "..", "extension", "discovery.js");
const FAMILIES = path.join(__dirname, "..", "..", "extension", "families.js");

test.describe("discovery + families — Taste of Sha Xian (Chowbus Direct)", () => {
  test("Chowbus POS is the preferred Direct baseline and routes to the chowbus adapter", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(DISCOVERY, "utf8"));
    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(FAMILIES, "utf8"));

    const out = await page.evaluate(function () {
      var d = window.CheapBiteDiscovery.discoverChannels(document);
      var plan = window.CheapBiteFamilies.planGather(d);
      return { discovery: d, plan: plan };
    });

    // --- Discovery: Chowbus POS recognised as the Chowbus Direct backend. ---
    const chowbus = out.discovery.directCandidates.find(function (c) { return c.host === "pos.chowbus.com"; });
    expect(chowbus).toBeTruthy();
    expect(chowbus.backend).toBe("Chowbus");
    expect(chowbus.preferred).toBe(true);

    // Both Direct candidates surfaced (Chowbus + DoorDash Storefront), and the
    // "Preferred by business" Chowbus row wins as the primary Direct baseline.
    const directHosts = out.discovery.directCandidates.map(function (c) { return c.host; }).sort();
    expect(directHosts).toEqual(["order.online", "pos.chowbus.com"]);
    expect(out.discovery.direct && out.discovery.direct.host).toBe("pos.chowbus.com");

    // --- Plan: Chowbus is a Direct gather job on the chowbus adapter. ---
    const chowbusJob = out.plan.jobs.find(function (j) { return j.adapter === "chowbus"; });
    expect(chowbusJob).toBeTruthy();
    expect(chowbusJob.isDirect).toBe(true);
    expect(chowbusJob.backend).toBe("Chowbus");
    expect(chowbusJob.key).toBe("Direct · Chowbus");

    // The full gather set: both Direct backends + one canonical aggregator per
    // family (Fantuan and HungryPanda now have adapters, so they're gathered too).
    const adapters = out.plan.jobs.map(function (j) { return j.adapter; }).sort();
    expect(adapters).toEqual(
      ["chowbus", "doordash", "fantuan", "grubhub", "hungrypanda", "storefront", "ubereats"]
    );

    // Fantuan and HungryPanda are now aggregator gather jobs (not Direct,
    // not unsupported) — HungryPanda was previously invisible to discovery.
    const fantuanJob = out.plan.jobs.find(function (j) { return j.adapter === "fantuan"; });
    expect(fantuanJob).toBeTruthy();
    expect(fantuanJob.isDirect).toBe(false);
    expect(fantuanJob.key).toBe("Fantuan");

    const pandaJob = out.plan.jobs.find(function (j) { return j.adapter === "hungrypanda"; });
    expect(pandaJob).toBeTruthy();
    expect(pandaJob.isDirect).toBe(false);
    expect(pandaJob.key).toBe("HungryPanda");

    const unsupportedKeys = out.plan.unsupported.map(function (u) { return u.key; });
    expect(unsupportedKeys).not.toContain("Fantuan");
    expect(unsupportedKeys).not.toContain("HungryPanda");
  });
});
