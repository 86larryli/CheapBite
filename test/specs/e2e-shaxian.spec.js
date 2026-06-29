// Live headed E2E gather for Taste of Sha Xian (San Mateo) — the richest test of
// the newest adapters: Chowbus (Direct), Fantuan, HungryPanda, DoorDash,
// order.online (Storefront), Grubhub, Uber Eats all on one store. Exercises the
// REAL flow: load the unpacked extension → live Maps → Compare button →
// /searchviewer/ → CTA → service worker gathers each channel in a background tab
// (programmatic inject) → ranked Upcharge overlay.
//
// Live + adversarial: Grubhub may be closed (gated → flagged), Uber Eats may
// trip reCAPTCHA (flagged). Graceful degradation (ADR-0013) means the overlay
// still ranks whatever is readable. Assertions are lenient — the point is to
// prove the gather runs end-to-end and to LOG the live result.
const { test, expect, chromium } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.join(__dirname, "..", "..", "extension");

test("live: Taste of Sha Xian — gather across new Asian adapters", async () => {
  test.setTimeout(360_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheapbite-e2e-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: false, // extensions don't load in classic headless
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  try {
    const page = await ctx.newPage();
    await page.goto("https://www.google.com/maps/search/" + encodeURIComponent("Taste of Sha Xian San Mateo CA"),
      { waitUntil: "domcontentloaded" });

    await page.waitForSelector("#cheapbite-compare-btn", { timeout: 60_000 });
    const [sv] = await Promise.all([ctx.waitForEvent("page"), page.click("#cheapbite-compare-btn")]);
    await sv.waitForLoadState("domcontentloaded");

    // user-initiated gather (ADR-0015)
    await sv.waitForSelector("#cheapbite-start-btn", { timeout: 60_000 });
    await sv.click("#cheapbite-start-btn");

    // Wait for the gather to finish and the overlay to settle into a result.
    await sv.waitForFunction(() => {
      const el = document.getElementById("cheapbite-overlay");
      return el && /more than|Couldn't read any|No ordering channel/.test(el.innerText);
    }, { timeout: 240_000 });

    const overlay = await sv.locator("#cheapbite-overlay").innerText();
    console.log("\n===== LIVE OVERLAY (Taste of Sha Xian) =====\n" + overlay + "\n============================================\n");

    // A real ranking was produced.
    expect(overlay).toMatch(/more than/);
    expect(overlay).toMatch(/\+\d+(\.\d+)?%|cheapest/);
    // At least one of the NEW adapters surfaced a channel live.
    expect(overlay).toMatch(/Chowbus|Fantuan|HungryPanda/);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
