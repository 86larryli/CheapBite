// Integration test of discovery.js + families.js against the captured Chef Xiong
// searchviewer fixture, focused on the new BeyondMenu Direct backend and its
// service-fee disclosure. Chef Xiong lists BeyondMenu ("Service fee $0.99",
// "Preferred by business") alongside Chowbus Direct and aggregators. Proves
// (1) beyondmenu.com classifies as the BeyondMenu Direct backend and wins as the
// preferred baseline, (2) the $0.99 fee is parsed from the row and carried onto
// the gather job, (3) "No fee" channels carry fee 0. Hermetic.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "chef-xiong-searchviewer.html");
const DISCOVERY = path.join(__dirname, "..", "..", "extension", "discovery.js");
const FAMILIES = path.join(__dirname, "..", "..", "extension", "families.js");

test.describe("discovery + families — Chef Xiong (BeyondMenu Direct + service fee)", () => {
  test("BeyondMenu is the preferred Direct baseline and its $0.99 fee reaches the job", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(DISCOVERY, "utf8"));
    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(FAMILIES, "utf8"));

    const out = await page.evaluate(function () {
      var d = window.CheapBiteDiscovery.discoverChannels(document);
      return { discovery: d, plan: window.CheapBiteFamilies.planGather(d) };
    });

    // --- Discovery: BeyondMenu recognised as a preferred Direct backend w/ fee. ---
    const bm = out.discovery.directCandidates.find(function (c) { return c.host === "www.beyondmenu.com"; });
    expect(bm).toBeTruthy();
    expect(bm.backend).toBe("BeyondMenu");
    expect(bm.preferred).toBe(true);
    expect(bm.fee).toBeCloseTo(0.99, 2);
    // Wins as the primary Direct baseline (over the non-preferred Chowbus).
    expect(out.discovery.direct && out.discovery.direct.host).toBe("www.beyondmenu.com");

    // A "No fee" channel carries fee 0 (Chowbus Direct here).
    const chowbus = out.discovery.directCandidates.find(function (c) { return c.host === "pos.chowbus.com"; });
    expect(chowbus && chowbus.fee).toBe(0);

    // --- Plan: BeyondMenu is a Direct gather job carrying the fee. ---
    const bmJob = out.plan.jobs.find(function (j) { return j.adapter === "beyondmenu"; });
    expect(bmJob).toBeTruthy();
    expect(bmJob.isDirect).toBe(true);
    expect(bmJob.backend).toBe("BeyondMenu");
    expect(bmJob.key).toBe("Direct · BeyondMenu");
    expect(bmJob.fee).toBeCloseTo(0.99, 2);

    // Chowbus is also gathered (a second Direct), and isn't flagged unsupported.
    expect(out.plan.jobs.some(function (j) { return j.adapter === "chowbus"; })).toBe(true);
    const unsupportedKeys = out.plan.unsupported.map(function (u) { return u.key; });
    expect(unsupportedKeys).not.toContain("Direct · BeyondMenu");
  });

  test("parseServiceFee reads the searchviewer fee text", async ({ page }) => {
    await page.setContent("<!doctype html><body></body>", { waitUntil: "domcontentloaded" });
    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(DISCOVERY, "utf8"));
    const r = await page.evaluate(function () {
      var f = window.CheapBiteDiscovery.parseServiceFee;
      return {
        beyondmenu: f("BeyondMenuService fee $0.99Ready in 15 minPreferred by business"),
        noFee: f("HungryPandaNo feeReady in 15 min"),
        none: f("Some Provider Ready in 20 min")
      };
    });
    expect(r.beyondmenu).toBeCloseTo(0.99, 2);
    expect(r.noFee).toBe(0);
    expect(r.none).toBe(null);
  });
});
