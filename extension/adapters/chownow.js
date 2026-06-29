// adapters/chownow.js — ChowNow (Direct backend) menu reader for CheapBite.
//
// ChowNow is a major US commission-free ordering platform. Google's searchviewer
// lists it under two entries that are the SAME underlying ordering app:
//   • "ChowNow"       → direct.chownow.com   (ChowNow Direct)
//   • "ChowNow Local" → www.chownow.com      (ChowNow's marketplace channel)
// Both resolve to the same /order/<rid>/locations/<lid> page with an identical
// DOM, so this one adapter covers both (discovery maps host "chownow.com" →
// backend "ChowNow"; planGather dedupes the two to a single "Direct · ChowNow"
// job). It's the restaurant's own ordering, so a Direct backend like Clover /
// Toast / Chowbus / MealKeyway / BeyondMenu / DoorDash Storefront.
//
// Client-rendered SPA, no menu JSON-LD, NOT virtualized — the whole menu renders
// across category sections, so a single DOM read gets everything. Each dish is a
// `[class*="itemContent--"]` card with the name in `[class*="name--"]` and the
// price in `[class*="price--"]` (a single clean "$NN.NN"; verified no dual-price
// across the menu). Classes are CSS-module hashes that shift between builds →
// match by PREFIX. Names kept whole (bilingual EN+中文 when present).
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;
  var CARD_SEL = '[class*="itemContent--"]';

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function matches(url) {
    try { return /(^|\.)chownow\.com$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  function parsePrice(text) {
    var m = (text || "").match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  function readCard(card) {
    var nameEl = card.querySelector('[class*="name--"]');
    var priceEl = card.querySelector('[class*="price--"]');
    var name = nameEl ? norm(nameEl.textContent) : "";
    var price = parsePrice(priceEl && priceEl.textContent);
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

  // Async only to wait out SPA render lag — not virtualized, so once the cards
  // appear one pass reads them all. Harmless on a static fixture.
  async function readMenu(root) {
    root = root || document;
    var t0 = Date.now();
    while (root.querySelectorAll(CARD_SEL).length === 0 && Date.now() - t0 < 6000) {
      await sleep(300);
    }
    var acc = {};
    collect(root, acc);
    return Object.keys(acc).map(function (n) { return { name: n, price: acc[n] }; });
  }

  var adapter = { backend: "ChowNow", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.chownow = adapter;
})(typeof window !== "undefined" ? window : this);
