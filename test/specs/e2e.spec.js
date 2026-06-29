// Live end-to-end tests of the full gather: load the unpacked extension, open a
// restaurant's Maps listing, click our button to open "Order online", and on
// the /searchviewer/ page assert the extension renders an Upcharge comparison.
//
// Drives live Google Maps + the providers, so flakier than the deterministic
// fixture tests (those are the gate). Extensions need a headed persistent
// context, so these open a real window and spawn short-lived gather tabs.
const { test, expect, chromium } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.join(__dirname, "..", "..", "extension");

async function compareOverlay(query) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheapbite-e2e-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: false, // extensions don't load in classic headless
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  try {
    const page = await ctx.newPage();
    await page.goto("https://www.google.com/maps/search/" + encodeURIComponent(query), { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#cheapbite-compare-btn", { timeout: 45000 });
    const [sv] = await Promise.all([ctx.waitForEvent("page"), page.click("#cheapbite-compare-btn")]);
    await sv.waitForLoadState("domcontentloaded");
    // The comparison is user-initiated (ADR-0015): click the CTA to start it.
    await sv.waitForSelector("#cheapbite-start-btn", { timeout: 45000 });
    await sv.click("#cheapbite-start-btn");
    await sv.waitForFunction(() => {
      const el = document.getElementById("cheapbite-overlay");
      return el && /more than|Couldn't read any|No ordering channel/.test(el.innerText);
    }, { timeout: 120000 });
    return await sv.locator("#cheapbite-overlay").innerText();
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("live: Pho Element — Clover Direct baseline vs aggregators", async () => {
  test.slow();
  const overlay = await compareOverlay("Pho Element San Mateo CA");
  console.log("OVERLAY (Pho Element):\n" + overlay);
  expect(overlay).toMatch(/direct/i);
  expect(overlay).toContain("DoorDash");
  expect(overlay).toContain("Uber Eats");
  expect(overlay).toMatch(/more than direct/);
  expect(overlay).toMatch(/\+\d+(\.\d+)?%/);
});

test("live: Kajiken — Toast Direct is readable and the cheapest baseline", async () => {
  test.slow();
  const overlay = await compareOverlay("Kajiken San Mateo CA");
  console.log("OVERLAY (Kajiken):\n" + overlay);
  // The Toast adapter makes the own-site the readable, cheapest baseline.
  expect(overlay).toMatch(/Order direct \(Toast\)/);
  expect(overlay).toMatch(/more than direct/);
  expect(overlay).toMatch(/\+\d+(\.\d+)?%/);
});
