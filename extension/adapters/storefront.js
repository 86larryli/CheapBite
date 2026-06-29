// adapters/storefront.js — DoorDash Storefront (order.online) menu reader.
//
// order.online is DoorDash's commission-free "Storefront" — the restaurant's
// OWN ordering, so we treat it as a Direct backend (often the true cheapest).
// It's NOT the doordash.com marketplace: no schema.org JSON-LD (Next.js RSC),
// and the menu is VIRTUALIZED, so we DOM-scrape and scroll-accumulate. Because
// it's virtualized, the gather reads it in a FOCUSED tab (background rendering
// is paused — see background.js VIRTUALIZED / ADR-0014). Reading it hidden only
// ever yields the ~25 featured cards, so a focused read is required for the
// full ~130+ item menu.
//
// Two layouts seen in the wild:
//   • Current: each item is `[data-testid="GenericItemCard"]` with an `<h3>`
//     name (full, bilingual) and a `[data-testid="StoreMenuItemPrice"]` price.
//     The top-of-page `image-action-card-container`s here are just the
//     "Featured / Most Ordered" CAROUSEL — a small subset — so when the real
//     GenericItemCards are present we read THOSE and ignore the carousel.
//   • Legacy: items are `[data-testid="image-action-card-container"]` whose leaf
//     text spans are [name, price]. Kept as a fallback (older captured fixtures).
//
// DOM-pure: takes a `root` for fixture testing.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;
  var GENERIC_SEL = '[data-testid="GenericItemCard"]';
  var LEGACY_SEL = '[data-testid="image-action-card-container"]';

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isMoney(t) { return /^\s*\$\s?\d/.test(t || ""); }

  function matches(url) {
    try { return /(^|\.)order\.online$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  function parsePrice(text) {
    var m = (text || "").match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  // Current layout: name = the card's heading, price = the explicit price tag.
  function collectGeneric(root, acc) {
    var cards = root.querySelectorAll(GENERIC_SEL);
    Array.prototype.forEach.call(cards, function (card) {
      var ne = card.querySelector("h3, h2, h4");
      var pe = card.querySelector('[data-testid="StoreMenuItemPrice"]');
      if (!ne || !pe) return;
      var name = norm(ne.textContent), price = parsePrice(pe.textContent);
      if (name && price != null && !(name in acc)) acc[name] = price;
    });
  }

  // Legacy layout: within a card, leaf text spans are [name, (description?), price].
  function collectLegacy(root, acc) {
    var cards = root.querySelectorAll(LEGACY_SEL);
    Array.prototype.forEach.call(cards, function (card) {
      var leaves = Array.prototype.slice.call(card.querySelectorAll("*"))
        .filter(function (el) { return el.children.length === 0 && (el.textContent || "").trim(); });
      var name = null, price = null;
      leaves.forEach(function (el) {
        var t = norm(el.textContent);
        if (price == null && isMoney(t)) price = parsePrice(t);
        else if (name == null && !isMoney(t)) name = t;
      });
      if (name && price != null && !(name in acc)) acc[name] = price;
    });
  }

  // Prefer the real menu (GenericItemCard); fall back to the legacy card only
  // when no GenericItemCards are present (older layout / captured fixture).
  function collect(root, acc) {
    if (root.querySelector(GENERIC_SEL)) collectGeneric(root, acc);
    else collectLegacy(root, acc);
  }

  function itemCount(root) {
    return root.querySelectorAll(GENERIC_SEL).length || root.querySelectorAll(LEGACY_SEL).length;
  }

  // Async: scroll-accumulate to defeat virtualization (harmless on a static
  // fixture — exits once no new items appear).
  async function readMenu(root) {
    root = root || document;
    var acc = {};

    var t0 = Date.now();
    while (itemCount(root) === 0 && Date.now() - t0 < 4000) { await sleep(300); }
    collect(root, acc);

    if (typeof window !== "undefined" && typeof window.scrollBy === "function" && document.body) {
      var bottomStreak = 0, staleStreak = 0, last = Object.keys(acc).length, start = Date.now();
      for (var i = 0; i < 120 && bottomStreak < 2 && staleStreak < 6 && Date.now() - start < 12000; i++) {
        window.scrollBy(0, Math.floor((window.innerHeight || 800) * 0.85));
        await sleep(250);
        collect(root, acc);
        var count = Object.keys(acc).length;
        staleStreak = count > last ? 0 : staleStreak + 1;
        last = count;
        var atBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 5);
        bottomStreak = atBottom ? bottomStreak + 1 : 0;
      }
    }
    return Object.keys(acc).map(function (n) { return { name: n, price: acc[n] }; });
  }

  var adapter = { backend: "DoorDash Storefront", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.storefront = adapter;
})(typeof window !== "undefined" ? window : this);
