// adapters/clover.js — Clover (Direct backend) menu reader for CheapBite.
//
// Clover Direct ordering sites live at *.cloveronline.com (the Google-listed
// clover.com/online-ordering/<id> link redirects there). It's a Next.js app
// with no clean menu JSON in the DOM (data is in the RSC __next_f stream), so
// we read the rendered DOM: each item is a card whose name+price row is a
// `div.flex.justify-between` containing "<name>$<price>"; the description is a
// separate sibling, so it isn't folded into the name.
//
// DOM-pure: takes a `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  var MONEY = /\$\s?([0-9]+(?:\.[0-9]{2})?)/;

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  // A leaf <span> whose text starts with a dollar amount (the price element).
  function isPriceLeaf(el) {
    return el.children.length === 0 && /^\s*\$\s?\d/.test(el.textContent || "");
  }

  // The restaurant menu host this adapter handles.
  function matches(url) {
    try { return /(^|\.)cloveronline\.com$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  // Returns [{ name, price }] — price is a Number in dollars.
  function readMenu(root) {
    root = root || document;
    var items = [];
    var seen = {};
    var priceLeaves = Array.prototype.slice
      .call(root.querySelectorAll("span"))
      .filter(isPriceLeaf);

    priceLeaves.forEach(function (p) {
      var ptext = norm(p.textContent);
      // Climb to the row that holds more than just the price (name + price).
      var row = p.parentElement;
      while (row && norm(row.textContent) === ptext) row = row.parentElement;
      if (!row) return;
      var name = norm(norm(row.textContent).replace(ptext, ""));
      var m = ptext.match(MONEY);
      if (!name || !m) return;
      var key = name + "|" + m[1];
      if (seen[key]) return;
      seen[key] = true;
      items.push({ name: name, price: parseFloat(m[1]) });
    });

    return items;
  }

  var adapter = { backend: "Clover", matches: matches, readMenu: readMenu };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.clover = adapter;
})(typeof window !== "undefined" ? window : this);
