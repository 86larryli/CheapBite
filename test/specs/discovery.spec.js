// Deterministic test of the REAL discovery.js against captured fixture HTML.
// Hermetic: all network is blocked and the fixture's own <script>s are stripped,
// so this never touches Google and never flakes. It validates the discovery
// logic, not live Maps (that's e2e.spec.js).
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "..", "fixtures", "phoelement-searchviewer.html");
const DISCOVERY = path.join(__dirname, "..", "..", "extension", "discovery.js");

test.describe("discovery.js — Pho Element searchviewer fixture", () => {
  test("classifies every provider and Direct candidate", async ({ page }) => {
    await page.route("**/*", function (route) { return route.abort(); }); // hermetic
    const html = fs.readFileSync(FIXTURE, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const src = fs.readFileSync(DISCOVERY, "utf8");
    await page.evaluate(function (s) { window.eval(s); }, src);
    const result = await page.evaluate(function () {
      return window.CheapBiteDiscovery.discoverChannels(document);
    });

    // All seven aggregator providers Google lists for this restaurant.
    const providerNames = result.providers.map(function (p) { return p.name; }).sort();
    expect(providerNames).toEqual(
      ["Caviar", "DoorDash", "Fantuan", "Grubhub", "Postmates", "Seamless", "Uber Eats"]
    );

    // Direct candidates: two known own-site backends + the preferred own-site row.
    // (The preferred row points at the restaurant's real ordering subdomain,
    // order.phoelement.com — not the www homepage.)
    const directHosts = result.directCandidates.map(function (d) { return d.host; }).sort();
    expect(directHosts).toEqual(["order.online", "order.phoelement.com", "www.clover.com"]);

    // Exactly one channel is "Preferred by business" — the restaurant's own site.
    const preferred = result.directCandidates
      .filter(function (d) { return d.preferred; })
      .map(function (d) { return d.host; });
    expect(preferred).toEqual(["order.phoelement.com"]);

    // The primary Direct is the preferred own-site channel.
    expect(result.direct && result.direct.host).toBe("order.phoelement.com");
  });
});
