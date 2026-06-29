// adapters/fantuan.js — Fantuan (饭团) aggregator menu reader for CheapBite.
//
// Fantuan is a pan–North-America Asian-food marketplace (fantuanorder.com).
// No usable menu JSON-LD (its Product node describes only the store), so we
// DOM-scrape. The menu is NOT virtualized — every dish renders into the page at
// once (inside an inner scroll container), so a single read after the cards
// appear gets the whole menu (no scroll-accumulate, no focus fallback).
//
// Each dish is a `[class*="good-item_goodItem"]` card with a bilingual name in
// `[class*="good-item_name"]` (EN + 中文, kept whole for per-script matching).
// CSS-module classes carry a hashed suffix that shifts between builds, so we
// match by PREFIX, never the exact class.
//
// PRICING — two rules, both from the builder's live testing:
//
//  1. EXCLUDE the "Rewards" section. Those items are redeemable only with
//     membership points (their card carries "N points to Redeem"); they're not
//     a cash price anyone can just pay, so they must not enter the comparison.
//     Several Rewards dishes ALSO appear in their real category at a real price,
//     so skipping the Rewards card lets the real one be captured instead.
//
//  2. For every other item there are up to THREE prices in the card:
//       (a) a struck-through original  (price-tag_dash span, grey/line-through)
//       (b) a BLACK discounted price next to it  (price-tag_int + price-tag_dec)
//       (c) a RED "after coupon" price (a separate element OUTSIDE the price box)
//     Only (b) is available to everyone with no terms (the coupon needs a
//     coupon; the struck price is a marketing anchor nobody pays), so (b) is our
//     Quote. We read it as the int+dec value inside the price-tag box — which
//     naturally excludes both the struck `dash` (also in the box) and the red
//     coupon (outside the box).
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var CARD_SEL = '[class*="good-item_goodItem"]';

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function matches(url) {
    try { return /(^|\.)fantuanorder\.com$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  // Rewards items are points-redeemable, not a cash price → exclude (rule 1).
  function isRewardCard(card) {
    return /points?\s+to\s+redeem/i.test(card.textContent || "");
  }

  // The black, no-terms discounted price (rule 2b): assemble the price-tag box's
  // integer + decimal spans. The struck-through original (`dash`, also in the
  // box) and the red coupon price (outside the box) are both excluded.
  function blackPrice(card) {
    var box = card.querySelector('[class*="price-tag_priceTag"]');
    if (!box) return null;
    var intEl = box.querySelector('[class*="price-tag_int"]');
    if (!intEl) return null;
    var decEl = box.querySelector('[class*="price-tag_dec"]');
    var intPart = (intEl.textContent || "").replace(/[^0-9]/g, "");
    if (!intPart) return null;
    var decMatch = decEl ? (decEl.textContent || "").match(/\.[0-9]+/) : null;
    var price = parseFloat(intPart + (decMatch ? decMatch[0] : ""));
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function readCard(card) {
    if (isRewardCard(card)) return null;
    var nameEl = card.querySelector('[class*="good-item_name"]');
    var name = nameEl ? norm(nameEl.textContent) : "";
    var price = blackPrice(card);
    if (!name || price == null) return null;
    return { name: name, price: price };
  }

  function collect(root, acc) {
    var cards = root.querySelectorAll(CARD_SEL);
    Array.prototype.forEach.call(cards, function (card) {
      var item = readCard(card);
      if (item && !(item.name in acc)) acc[item.name] = item.price; // dedupe by name
    });
  }

  // Async only to wait out render lag — the menu isn't virtualized, so once the
  // cards appear one pass reads them all. Harmless on a static fixture.
  async function readMenu(root) {
    root = root || document;
    var t0 = Date.now();
    while (root.querySelectorAll(CARD_SEL).length === 0 && Date.now() - t0 < 5000) {
      await sleep(250);
    }
    var acc = {};
    collect(root, acc);
    return Object.keys(acc).map(function (n) { return { name: n, price: acc[n] }; });
  }

  var adapter = {
    backend: "Fantuan", matches: matches, readMenu: readMenu,
    isRewardCard: isRewardCard, blackPrice: blackPrice // exposed for tests
  };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.fantuan = adapter;
})(typeof window !== "undefined" ? window : this);
