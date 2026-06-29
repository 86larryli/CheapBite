// Rasterize extension/icons/icon.svg into the PNG sizes Chrome needs.
// Uses the Playwright Chromium already installed for tests (no extra deps), so
// the output is deterministic across machines. Run with: npm run icons
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ICONS_DIR = path.join(__dirname, "..", "extension", "icons");
const SIZES = [16, 32, 48, 128];

(async () => {
  const svg = fs.readFileSync(path.join(ICONS_DIR, "icon.svg"), "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of SIZES) {
    const sized = svg
      .replace('width="128"', `width="${size}"`)
      .replace('height="128"', `height="${size}"`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${sized}</body>`);
    const el = await page.$("svg");
    await el.screenshot({ path: path.join(ICONS_DIR, `icon-${size}.png`), omitBackground: true });
  }
  await browser.close();
  console.log("Generated icons:", SIZES.map((s) => `icon-${s}.png`).join(", "));
})();
