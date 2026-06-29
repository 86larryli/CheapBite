// Integration test of discovery.js + families.js against the Max's of Burlingame
// searchviewer fixture, focused on the Grubhub Direct backend. Max's lists
// "Grubhub Direct" on a *.dine.online subdomain alongside the grubhub.com
// marketplace. Proves (1) the dine.online host classifies as the "Grubhub
// Direct" DIRECT backend (distinct from the Grubhub aggregator family), and
// (2) planGather routes it to the grubhubdirect adapter as a Direct job.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "maxs-burlingame-searchviewer.html");
const DISCOVERY = path.join(__dirname, "..", "..", "extension", "discovery.js");
const FAMILIES = path.join(__dirname, "..", "..", "extension", "families.js");

test.describe("discovery + families — Max's of Burlingame (Grubhub Direct)", () => {
  test("dine.online classifies as Grubhub Direct and routes to the grubhubdirect adapter", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(DISCOVERY, "utf8"));
    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(FAMILIES, "utf8"));

    const out = await page.evaluate(function () {
      var d = window.CheapBiteDiscovery.discoverChannels(document);
      return { discovery: d, plan: window.CheapBiteFamilies.planGather(d) };
    });

    // Grubhub Direct is a Direct candidate on its *.dine.online subdomain —
    // and distinct from the grubhub.com marketplace (which is an aggregator).
    const ghd = out.discovery.directCandidates.find(function (c) { return /dine\.online$/.test(c.host); });
    expect(ghd).toBeTruthy();
    expect(ghd.backend).toBe("Grubhub Direct");

    // Routed to the grubhubdirect adapter as a Direct gather job.
    const job = out.plan.jobs.find(function (j) { return j.adapter === "grubhubdirect"; });
    expect(job).toBeTruthy();
    expect(job.isDirect).toBe(true);
    expect(job.backend).toBe("Grubhub Direct");
    expect(job.key).toBe("Direct · Grubhub Direct");

    // The grubhub.com marketplace is still a separate aggregator job.
    expect(out.plan.jobs.some(function (j) { return j.adapter === "grubhub"; })).toBe(true);

    const unsupportedKeys = out.plan.unsupported.map(function (u) { return u.key; });
    expect(unsupportedKeys).not.toContain("Direct · Grubhub Direct");
  });
});
