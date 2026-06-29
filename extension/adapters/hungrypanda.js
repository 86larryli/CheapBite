// adapters/hungrypanda.js — HungryPanda (熊猫外卖) aggregator menu reader.
//
// HungryPanda (usa.hungrypanda.co) is a Chinese-food-focused delivery
// marketplace (also branded EASI). No menu JSON-LD, so we DOM-scrape. The menu
// is NOT virtualized — every dish renders into the page at once — so a single
// read after the cards appear gets the whole menu (no scroll-accumulate, no
// focus fallback).
//
// The DOM is refreshingly plain (Angular app, but stable human-readable class
// names — NOT hashed CSS modules): each dish is a `.good-item-content` card with
// the bilingual name in `.good-item-name` (EN + 中文, kept whole for per-script
// matching) and the price in `.good-item-btm` (a single clean "$NN.NN"; the
// "Add" button is a sibling, not inside it). No Rewards/points section and no
// multi-price discount layout (unlike Fantuan) — one price per item, verified
// across the full 206-card menu.
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;
  var CARD_SEL = ".good-item-content";

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function matches(url) {
    try { return /(^|\.)hungrypanda\.co$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  function parsePrice(text) {
    var m = (text || "").match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  function readCard(card) {
    var nameEl = card.querySelector(".good-item-name");
    var priceEl = card.querySelector(".good-item-btm");
    var name = nameEl ? norm(nameEl.textContent) : "";
    var price = parsePrice(priceEl && priceEl.textContent);
    if (!name || price == null) return null;
    return { name: name, price: price };
  }

  function collect(root, acc) {
    var cards = root.querySelectorAll(CARD_SEL);
    Array.prototype.forEach.call(cards, function (card) {
      var item = readCard(card);
      if (item && !(item.name in acc)) acc[item.name] = item.price; // dedupe (dishes repeat across categories)
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

  var adapter = { backend: "HungryPanda", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.hungrypanda = adapter;
})(typeof window !== "undefined" ? window : this);
