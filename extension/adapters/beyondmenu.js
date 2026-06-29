// adapters/beyondmenu.js — BeyondMenu (Direct backend) menu reader for CheapBite.
//
// BeyondMenu (www.beyondmenu.com) is a restaurant's own commission-free-ish
// ordering site — Google surfaces it as the "Preferred by business" Direct row —
// so we treat it as a Direct backend (like Clover / Toast / Chowbus / MealKeyway
// / DoorDash Storefront). NOTE: BeyondMenu charges a flat service fee ($0.99),
// which Google shows on the searchviewer; that fee is captured during discovery
// and surfaced as a UI note (see discovery.js parseServiceFee + content.js). The
// menu prices here are the item subtotals (pre-fee), consistent with ADR-0009.
//
// Server-rendered .aspx page, no menu JSON-LD, NOT virtualized — the whole menu
// renders across category groups, so a single DOM read gets everything. Plain,
// stable class names (not hashed): each dish is a `.menu-item-link` card with the
// name in `[class*="menu-item-link-itemname"]` (bilingual EN+中文, often prefixed
// with an item code like "A1") and the price in `[class*="menu-item-link-price"]`
// (the class carries an A/B-experiment suffix, so we PREFIX-match it). The name
// element also contains a Material-icons spicy marker (`<div
// class="material-icons menu-item-link-spicy">whatshot</div>`) whose ligature
// text would otherwise pollute the name — we strip icon elements before reading.
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;
  var CARD_SEL = ".menu-item-link";

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function matches(url) {
    try { return /(^|\.)beyondmenu\.com$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  function parsePrice(text) {
    var m = (text || "").match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  // Read the item name without the Material-icons ligature noise (e.g. the
  // "whatshot" spicy flame). Clone, drop icon/svg children, then take text.
  function readName(nameEl) {
    if (!nameEl) return "";
    var clone = nameEl.cloneNode(true);
    Array.prototype.forEach.call(
      clone.querySelectorAll('.material-icons, [class*="spicy"], svg, i'),
      function (n) { n.remove(); }
    );
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function readCard(card) {
    var name = readName(card.querySelector('[class*="menu-item-link-itemname"]'));
    var priceEl = card.querySelector('[class*="menu-item-link-price"]');
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

  // Async only to wait out render lag — not virtualized, so once the cards
  // appear one pass reads them all. Harmless on a static fixture.
  async function readMenu(root) {
    root = root || document;
    var t0 = Date.now();
    while (root.querySelectorAll(CARD_SEL).length === 0 && Date.now() - t0 < 5000) {
      await sleep(300);
    }
    var acc = {};
    collect(root, acc);
    return Object.keys(acc).map(function (n) { return { name: n, price: acc[n] }; });
  }

  var adapter = { backend: "BeyondMenu", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.beyondmenu = adapter;
})(typeof window !== "undefined" ? window : this);
