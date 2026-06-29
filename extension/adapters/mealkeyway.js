// adapters/mealkeyway.js — MealKeyway / MenuSifu (Direct backend) menu reader.
//
// MealKeyway (order.mealkeyway.com, the consumer front for the MenuSifu POS) is
// a restaurant's OWN commission-free ordering site — Google surfaces it as the
// "Preferred by business" Direct row — so we treat it as a Direct backend (like
// Clover / Toast / Chowbus / DoorDash Storefront).
//
// It's a client-rendered SPA (hash route #/main) with no menu JSON-LD, so we
// DOM-scrape. The whole menu renders at once across category sections (NOT
// virtualized), so a single read after the cards appear gets everything — no
// scroll-accumulate. Each dish is a `[class*="mainPage_itemBody"]` card with the
// name in `[class*="mainPage_itemName"]` and the price in
// `[class*="mainPage_itemDisplayPrice"]` (the displayed/payable price). Classes
// are CSS-module hashes that shift between builds → match by PREFIX.
//
// No points/rewards section and no dual-price discount layout were present
// (verified across the full 202-item menu: every item shows a single price,
// itemPrice === itemDisplayPrice). We still read itemDisplayPrice specifically
// (the shown price) so that, were an original/struck price ever added, we'd take
// the displayed one. Names are kept whole (bilingual EN+中文 when present, for
// per-script matching).
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;
  var CARD_SEL = '[class*="mainPage_itemBody"]';

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function matches(url) {
    try { return /(^|\.)mealkeyway\.com$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  function parsePrice(text) {
    var m = (text || "").match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  function readCard(card) {
    var nameEl = card.querySelector('[class*="mainPage_itemName"]');
    var priceEl = card.querySelector('[class*="mainPage_itemDisplayPrice"]')
               || card.querySelector('[class*="mainPage_itemPrice"]');
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

  // Async only to wait out SPA render lag (the hash-routed app boots, then renders
  // all category sections at once). Not virtualized, so one pass reads them all.
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

  var adapter = { backend: "MealKeyway", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.mealkeyway = adapter;
})(typeof window !== "undefined" ? window : this);
