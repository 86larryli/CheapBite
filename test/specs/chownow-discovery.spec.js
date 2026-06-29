// Integration test of discovery.js + families.js against the captured Max's of
// Burlingame searchviewer fixture. This store lists ChowNow TWICE — "ChowNow"
// (direct.chownow.com) and "ChowNow Local" (www.chownow.com) — which are the
// same ordering app. Proves (1) both hosts classify as the ChowNow Direct
// backend, (2) planGather dedupes them to a SINGLE "Direct · ChowNow" job, and
// (3) Grubhub Direct (*.dine.online) is not yet supported (no adapter → not
// gathered). Hermetic.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "maxs-burlingame-searchviewer.html");
const DISCOVERY = path.join(__dirname, "..", "..", "extension", "discovery.js");
const FAMILIES = path.join(__dirname, "..", "..", "extension", "families.js");

test.describe("discovery + families — Max's of Burlingame (ChowNow x2)", () => {
  test("both ChowNow entries classify as ChowNow and dedupe to one gather job", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); });
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(DISCOVERY, "utf8"));
    await page.evaluate(function (s) { window.eval(s); }, fs.readFileSync(FAMILIES, "utf8"));

    const out = await page.evaluate(function () {
      var d = window.CheapBiteDiscovery.discoverChannels(document);
      return { discovery: d, plan: window.CheapBiteFamilies.planGather(d) };
    });

    // Both ChowNow hosts surfaced as Direct candidates, both backend "ChowNow".
    const cnHosts = out.discovery.directCandidates
      .filter(function (c) { return c.backend === "ChowNow"; })
      .map(function (c) { return c.host; }).sort();
    expect(cnHosts).toEqual(["direct.chownow.com", "www.chownow.com"]);

    // …but they dedupe to exactly ONE gather job on the chownow adapter.
    const cnJobs = out.plan.jobs.filter(function (j) { return j.adapter === "chownow"; });
    expect(cnJobs.length).toBe(1);
    expect(cnJobs[0].key).toBe("Direct · ChowNow");
    expect(cnJobs[0].isDirect).toBe(true);

    // ChowNow has an adapter now → not flagged unsupported.
    const unsupportedKeys = out.plan.unsupported.map(function (u) { return u.key; });
    expect(unsupportedKeys).not.toContain("Direct · ChowNow");

    // Grubhub Direct (*.dine.online) is its own Direct backend → also gathered.
    expect(out.plan.jobs.some(function (j) { return j.adapter === "grubhubdirect"; })).toBe(true);
  });
});
