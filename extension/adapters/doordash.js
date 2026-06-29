// adapters/doordash.js — DoorDash menu reader for CheapBite.
//
// Unlike Clover (which forces DOM scraping), DoorDash embeds the full menu as
// schema.org structured data in a <script type="application/ld+json"> with
// "@type":"Menu". We parse that instead of the DOM, which is far more robust:
// it's standardized, present in the initial HTML (so no lazy-load scrolling —
// DoorDash only DOM-renders a few items until you scroll), and free of the
// rating numbers that pollute the visible price text ("$20.25 • 95% (323)").
//
// The same parser also covers DoorDash-family siblings (Caviar) and DoorDash
// Storefront (order.online), which serve the same JSON-LD shape — see ADR-0012.
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{2})?)/;

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  // Flatten hasMenuSection, which DoorDash sometimes nests one level deep.
  function flattenSections(menu) {
    var secs = menu.hasMenuSection || [];
    if (secs.length && Array.isArray(secs[0])) {
      secs = secs.reduce(function (a, b) { return a.concat(b); }, []);
    }
    return secs;
  }

  function priceOf(item) {
    var offer = item.offers;
    if (Array.isArray(offer)) offer = offer[0];
    var raw = offer && offer.price != null ? String(offer.price) : "";
    var m = raw.match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  function matches(url) {
    try {
      var h = new URL(url, "http://x").hostname;
      return /(^|\.)doordash\.com$/.test(h) || /(^|\.)trycaviar\.com$/.test(h) ||
             /(^|\.)order\.online$/.test(h);
    } catch (e) { return false; }
  }

  // Returns [{ name, price }] parsed from the JSON-LD Menu. De-dupes the
  // "Most Ordered" section, which repeats items that also appear in their real
  // category. price is a Number in dollars.
  function readMenu(root) {
    root = root || document;
    var scripts = root.querySelectorAll('script[type="application/ld+json"]');
    var menu = null;
    for (var i = 0; i < scripts.length; i++) {
      try {
        var j = JSON.parse(scripts[i].textContent);
        if (j && j["@type"] === "Menu") { menu = j; break; }
      } catch (e) { /* not the menu script */ }
    }
    if (!menu) return [];

    var items = [];
    var seen = {};
    flattenSections(menu).forEach(function (sec) {
      (sec.hasMenuItem || []).forEach(function (it) {
        var name = norm(it.name);
        var price = priceOf(it);
        if (!name || price == null) return;
        var key = name + "|" + price;
        if (seen[key]) return;
        seen[key] = true;
        items.push({ name: name, price: price });
      });
    });
    return items;
  }

  var adapter = { backend: "DoorDash", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.doordash = adapter;
})(typeof window !== "undefined" ? window : this);
