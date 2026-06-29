// adapters/grubhubdirect.js — Grubhub Direct (Direct backend) menu reader.
//
// Grubhub Direct is Grubhub's white-label, commission-free own-ordering platform
// (each restaurant on a `*.dine.online` subdomain). It's the restaurant's own
// site — Google lists it as "Grubhub Direct" — so a Direct backend like Clover /
// Toast / Chowbus / MealKeyway / BeyondMenu / ChowNow / DoorDash Storefront. NOT
// the grubhub.com marketplace (that's the separate, virtualized `grubhub.js`).
//
// Client-rendered SPA, no menu JSON-LD, NOT virtualized — the whole menu renders
// across category sections, so a single DOM read gets everything. Each dish is a
// `[class*="MenuItem_container"]` card with the name in `[class*="MenuItem_title"]`
// and the price as a standalone leaf (e.g. "$27.00" or "$9.00+", the "+" meaning
// size/modifier options → we take the base price). The price element has no
// stable class, so we pick the card's leaf whose text IS just a price. The page
// also has an OffersCarousel of promos ("$6 off…") — it lives OUTSIDE the
// MenuItem cards, so scoping to them avoids it. Names kept whole (bilingual when
// present). Classes are CSS-module hashes → match by PREFIX.
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;
  // A leaf that is exactly a price, optionally with a trailing "+" (size options).
  var PRICE_ONLY = /^\$\s*[0-9]+(?:\.[0-9]{1,2})?\+?$/;
  var CARD_SEL = '[class*="MenuItem_container"]';

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function matches(url) {
    try { return /(^|\.)dine\.online$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  // Price = the card's leaf whose text is just a price (base price; drop the "+").
  function priceOf(card) {
    var leaves = card.querySelectorAll("*");
    for (var i = 0; i < leaves.length; i++) {
      var el = leaves[i];
      if (el.children.length) continue;
      var t = (el.textContent || "").trim();
      if (PRICE_ONLY.test(t)) {
        var m = t.match(MONEY);
        return m ? parseFloat(m[1]) : null;
      }
    }
    return null;
  }

  function readCard(card) {
    var nameEl = card.querySelector('[class*="MenuItem_title"]');
    var name = nameEl ? norm(nameEl.textContent) : "";
    var price = priceOf(card);
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

  // Async only to wait out SPA render lag — not virtualized, so one pass reads
  // them all once present. Harmless on a static fixture.
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

  var adapter = { backend: "Grubhub Direct", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.grubhubdirect = adapter;
})(typeof window !== "undefined" ? window : this);
