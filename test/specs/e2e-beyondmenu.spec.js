// Live headed E2E for Chef Xiong Kitchen (San Francisco) — the richest test of
// the newest work: BeyondMenu (preferred Direct, flat $0.99 service fee) +
// Chowbus (embedded-Flight multi-menu parse) + HungryPanda + DoorDash Storefront
// + DoorDash + Uber Eats, all on one store. Exercises the real gather AND, most
// importantly, confirms the per-channel SERVICE-FEE NOTE renders in the overlay
// (the one piece not covered by unit tests).
//
// Live + adversarial: assertions are lenient — the point is to prove the gather
// runs end-to-end and to LOG the live overlay (incl. the fee note).
const { test, expect, chromium } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.join(__dirname, "..", "..", "extension");

test("live: Chef Xiong — BeyondMenu Direct + $0.99 service-fee note", async () => {
  test.setTimeout(360_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheapbite-e2e-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  try {
    const page = await ctx.newPage();
    await page.goto("https://www.google.com/maps/search/" + encodeURIComponent("Chef Xiong Kitchen San Francisco"),
      { waitUntil: "domcontentloaded" });

    await page.waitForSelector("#cheapbite-compare-btn", { timeout: 60_000 });
    const [sv] = await Promise.all([ctx.waitForEvent("page"), page.click("#cheapbite-compare-btn")]);
    await sv.waitForLoadState("domcontentloaded");

    await sv.waitForSelector("#cheapbite-start-btn", { timeout: 60_000 });
    await sv.click("#cheapbite-start-btn");

    await sv.waitForFunction(() => {
      const el = document.getElementById("cheapbite-overlay");
      return el && /more than|Couldn't read any|No ordering channel/.test(el.innerText);
    }, { timeout: 240_000 });

    const overlay = await sv.locator("#cheapbite-overlay").innerText();
    console.log("\n===== LIVE OVERLAY (Chef Xiong) =====\n" + overlay + "\n=====================================\n");

    // A real ranking was produced.
    expect(overlay).toMatch(/more than|cheapest/);
    // BeyondMenu surfaced as a Direct channel.
    expect(overlay).toMatch(/BeyondMenu/);
    // The $0.99 service-fee note rendered (the new UI feature).
    expect(overlay).toMatch(/service fee/i);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
