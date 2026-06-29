// adapters/ubereats.js — Uber Eats menu reader for CheapBite.
//
// Like DoorDash, Uber Eats embeds the menu as schema.org JSON-LD — but nested
// under a Restaurant ("@type":"Restaurant" → hasMenu → hasMenuSection) rather
// than a top-level Menu, and with bare-number prices ("14.50" + priceCurrency)
// rather than "$14.50". This reader handles both shapes, so it also covers the
// Uber family sibling Postmates (same JSON-LD). DOM-pure: takes a `root` for
// fixture testing.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function matches(url) {
    try {
      var h = new URL(url, "http://x").hostname;
      return /(^|\.)ubereats\.com$/.test(h) || /(^|\.)postmates\.com$/.test(h);
    } catch (e) { return false; }
  }

  // Find a Menu object in a parsed JSON-LD node: either it IS a Menu, or it's a
  // Restaurant carrying one under hasMenu/menu.
  function menuFrom(node) {
    if (!node || typeof node !== "object") return null;
    if (node["@type"] === "Menu" && node.hasMenuSection) return node;
    var m = node.hasMenu || node.menu;
    if (m && m.hasMenuSection) return m;
    return null;
  }

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

  // Returns [{ name, price }] from the JSON-LD menu, de-duped.
  function readMenu(root) {
    root = root || document;
    var scripts = root.querySelectorAll('script[type="application/ld+json"]');
    var menu = null;
    for (var i = 0; i < scripts.length && !menu; i++) {
      try { menu = menuFrom(JSON.parse(scripts[i].textContent)); } catch (e) { /* skip */ }
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

  var adapter = { backend: "Uber Eats", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.ubereats = adapter;
})(typeof window !== "undefined" ? window : this);
