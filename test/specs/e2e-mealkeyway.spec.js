// Live headed E2E for Top SF BBQ (San Francisco) — confirms the MealKeyway /
// MenuSifu adapter through the REAL gather. MealKeyway is a heavy hash-routed
// SPA (#/main), so the open question this answers is whether it boots + renders
// in a background tab within the read budget. Store also has Fantuan (expected
// bot-timeout → flagged), HungryPanda, order.online, DoorDash, Grubhub, Uber.
//
// Live + adversarial: lenient assertions — prove the gather runs and LOG the
// overlay; MealKeyway is the channel of interest.
const { test, expect, chromium } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.join(__dirname, "..", "..", "extension");

test("live: Top SF BBQ — MealKeyway Direct gathers through the real flow", async () => {
  test.setTimeout(360_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheapbite-e2e-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  try {
    const page = await ctx.newPage();
    await page.goto("https://www.google.com/maps/search/" + encodeURIComponent("Top SF BBQ San Francisco"),
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
    console.log("\n===== LIVE OVERLAY (Top SF BBQ) =====\n" + overlay + "\n=====================================\n");

    expect(overlay).toMatch(/more than|cheapest/);
    // MealKeyway surfaced as a Direct channel (the heavy SPA read through the gather).
    expect(overlay).toMatch(/MealKeyway/);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
