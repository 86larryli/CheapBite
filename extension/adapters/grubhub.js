// adapters/grubhub.js — Grubhub menu reader for CheapBite.
//
// Grubhub has NO embedded menu JSON, so we scrape the DOM — and the list is
// VIRTUALIZED (rows unload as you scroll), so a single read sees only a
// viewport's worth. readMenu is therefore async: it scrolls the page and
// accumulates items (deduped by full name) until it reaches the bottom or a
// time cap. We don't need every item — a solid sample gives a robust median
// Upcharge (ADR-0009).
//
// Each item is a `[data-testid="restaurant-menu-item-button"]` card holding
// `[data-testid="menu-item-name-container"]` (the full name) and
// `[data-testid="menu-item-price"]` (e.g. "$20.25+"; the "+" denotes size
// options — we take the base price). Best-Sellers cards instead nest a
// `menuItem-info` with the name truncated in text but full in the `title`
// attribute, so we fall back to `[itemprop="name"]`'s title there. These
// per-item testids scope us to menu items (not fee/footer text). Also covers
// the Grubhub sibling Seamless.
//
// CLOSED-store gate (ADR-0013): when a restaurant is closed, Grubhub renders
// the full category SCAFFOLD (all `category_*` headers) but gates the items
// behind picking a future pickup time, leaving only a ~12-item "best sellers"
// preview. Ranking on that thin, popularity-biased slice would be misleading,
// so we DETECT the gate and return [] (→ flagged "unavailable", not ranked).
// The robust signature, confirmed live + on fixtures: many category headers but
// fewer accumulated items than categories (open stores always have several
// items per category — Chino Yang's open: 169 items / 18 cats; the same store
// closed: 12 / 17). No reliable store-level "Closed" text exists — the only
// "Closed" badge is delivery-specific (would mis-flag open-for-pickup stores).
// A precise "store closed" message + the co-pilot time-picker handoff (ADR-0011)
// are the deferred follow-up; for now we degrade honestly.
"use strict";

(function (global) {
  var MONEY = /([0-9]+(?:\.[0-9]{1,2})?)/;
  // A real multi-category menu showing fewer items than it has categories is
  // gated (closed). Guard with a category floor so a genuinely small menu
  // (few categories) is never mistaken for gated.
  var MIN_CATS_FOR_GATE = 6;

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Number of menu category sections present (the scaffold renders even when
  // the store is closed).
  function categoryCount(root) {
    return root.querySelectorAll('[data-testid^="category_"]').length;
  }

  // The closed/gated signature: a full category scaffold but the items inside
  // it never rendered (only a best-sellers preview).
  function isGatedMenu(itemCount, catCount) {
    return catCount >= MIN_CATS_FOR_GATE && itemCount < catCount;
  }

  function matches(url) {
    try {
      var h = new URL(url, "http://x").hostname;
      return /(^|\.)grubhub\.com$/.test(h) || /(^|\.)seamless\.com$/.test(h);
    } catch (e) { return false; }
  }

  function parsePrice(text) {
    var m = (text || "").match(MONEY);
    return m ? parseFloat(m[1]) : null;
  }

  var ITEM_SEL = '[data-testid="restaurant-menu-item-button"]';

  // Collect currently-rendered items into `acc` (name → price), deduped.
  function collect(root, acc) {
    var cards = root.querySelectorAll(ITEM_SEL);
    Array.prototype.forEach.call(cards, function (card) {
      var ne = card.querySelector('[data-testid="menu-item-name-container"]') || card.querySelector('[itemprop="name"]');
      var pe = card.querySelector('[data-testid="menu-item-price"]') || card.querySelector('[itemprop="price"]');
      if (!ne || !pe) return;
      // Category cards carry the full name in text; Best-Sellers truncate it but
      // expose the full name in the title attribute.
      var name = norm(ne.getAttribute("title") || ne.textContent);
      var price = parsePrice(pe.textContent);
      if (name && price != null && !(name in acc)) acc[name] = price;
    });
  }

  function toItems(acc) {
    return Object.keys(acc).map(function (name) { return { name: name, price: acc[name] }; });
  }

  // Async: scroll-accumulate to defeat virtualization. Harmless on a static
  // fixture (reaches "bottom" quickly and just returns what's present).
  async function readMenu(root) {
    root = root || document;
    var acc = {};

    // Grubhub shows a brief splash — wait for the first items to render.
    var t0 = Date.now();
    while (root.querySelectorAll(ITEM_SEL).length === 0 && Date.now() - t0 < 4000) {
      await sleep(300);
    }
    collect(root, acc);

    var scrollable = typeof window !== "undefined" && typeof window.scrollBy === "function" && document.body;
    if (scrollable) {
      var bottomStreak = 0, staleStreak = 0, lastCount = Object.keys(acc).length, start = Date.now();
      for (var i = 0; i < 120 && bottomStreak < 2 && staleStreak < 6 && Date.now() - start < 12000; i++) {
        window.scrollBy(0, Math.floor((window.innerHeight || 800) * 0.8));
        await sleep(250);
        collect(root, acc);
        var count = Object.keys(acc).length;
        staleStreak = count > lastCount ? 0 : staleStreak + 1; // stop once no new items appear
        lastCount = count;
        var atBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 5);
        bottomStreak = atBottom ? bottomStreak + 1 : 0;
      }
    }

    var items = toItems(acc);
    // Store closed → only a best-sellers preview rendered behind a time gate.
    // Return [] so the channel is flagged unavailable, not ranked on the slice.
    if (isGatedMenu(items.length, categoryCount(root))) {
      try { console.warn("[CheapBite] Grubhub menu gated (store likely closed): " +
        items.length + " items vs " + categoryCount(root) + " categories — flagging unavailable."); } catch (e) {}
      return [];
    }
    return items;
  }

  var adapter = {
    backend: "Grubhub", matches: matches, readMenu: readMenu,
    // exposed for unit tests
    isGatedMenu: isGatedMenu, categoryCount: categoryCount
  };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.grubhub = adapter;
})(typeof window !== "undefined" ? window : this);
