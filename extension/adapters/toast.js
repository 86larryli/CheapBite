// adapters/toast.js — Toast (Direct backend) menu reader for CheapBite.
//
// Toast online ordering (order.toasttab.com / www.toasttab.com/local/order/…)
// embeds only an empty Restaurant JSON-LD stub, so we read the DOM. The page is
// NOT virtualized (the whole menu renders), so a single synchronous read works.
//
// Each item is `<li data-testid="menu-item-card">` with an `<h3>` name (full,
// not truncated) and a price `[data-testid^="price-"]` (`span.price`). The
// "Featured Items" section repeats items, so we dedupe by name. Covers both
// Toast URL shapes (matches toasttab.com).
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function matches(url) {
    try { return /(^|\.)toasttab\.com$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  function parsePrice(text) {
    var m = (text || "").match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  // Returns [{ name, price }], deduped by name.
  function readMenu(root) {
    root = root || document;
    var cards = root.querySelectorAll('[data-testid="menu-item-card"]');
    var acc = {};
    Array.prototype.forEach.call(cards, function (card) {
      var ne = card.querySelector("h3") || card.querySelector("h2, h4, [class*='itemName']");
      var pe = card.querySelector('[data-testid^="price-"]') || card.querySelector("span.price");
      if (!ne || !pe) return;
      var name = norm(ne.textContent);
      var price = parsePrice(pe.textContent);
      if (!name || price == null || (name in acc)) return;
      acc[name] = price;
    });
    return Object.keys(acc).map(function (n) { return { name: n, price: acc[n] }; });
  }

  var adapter = { backend: "Toast", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.toast = adapter;
})(typeof window !== "undefined" ? window : this);
