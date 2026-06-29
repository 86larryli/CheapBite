// adapters/chowbus.js — Chowbus POS (Direct backend) menu reader for CheapBite.
//
// Chowbus is an Asian-food company with two arms: a consumer marketplace
// (chowbus.com) and a commission-free restaurant ordering POS (pos.chowbus.com).
// Google's "Order online" surfaces the POS row as the "Preferred by business"
// Direct option — usually the true cheapest Channel — so we treat it as a Direct
// backend (like Toast / Clover / DoorDash Storefront).
//
// WHY WE PARSE EMBEDDED DATA INSTEAD OF SCRAPING THE DOM:
// A Chowbus store can have MULTIPLE menus (e.g. "Hot Pot", "Sichuan Style",
// "Barbecue"), and the page renders only ONE at a time. Switching menus is a
// real-click-only interaction (a menu tab opens a category dropdown; picking a
// category swaps the meal list) that React ignores when driven by injected
// (untrusted) events — so the background-tab gather can't click through them.
// A DOM scrape therefore captures only the active menu (e.g. 11 of 175+ items).
//
// BUT every menu's meals are already in the page as a Next.js Flight (RSC)
// stream — `self.__next_f.push([1,"<chunk>"])` script tags. We decode those
// chunks and extract the meal records directly, which yields the COMPLETE menu
// across all sub-menus (including ones that are closed right now) in a single
// read, with no clicking and no scrolling. Each meal record carries:
//   "name" (English) · "foreign_name" (中文) · "menu_price" (the regular price)
// We join EN + 中文 for per-script matching, and use `menu_price` — which is the
// regular price; the membership/points discount lives in a separate
// `member_price` field that we intentionally ignore (the crown price isn't
// payable without points). Items are deduped by name.
//
// Isolated-world safe: reads <script> textContent (DOM), never the page's
// window.__next_f global (unavailable in the injected world). DOM-pure: takes a
// `root` so it can be unit-tested against a saved fixture.
"use strict";

(function (global) {
  // A Next.js Flight chunk: `…push([<n>,"<escaped-json-string>"])`. The string
  // body uses standard JSON string escaping, so JSON.parse decodes it cleanly.
  var PUSH_RE = /\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)/g;

  // A meal record in the decoded payload. Anchored on the meal's name (meals are
  // name-first; category objects are foreign_name-first, so they don't match),
  // then lazily skip intervening fields (kitchen_name, rg_meal_display_id, …)
  // up to this meal's menu_price — without crossing into the next meal's "name".
  var MEAL_RE = /"name":"((?:[^"\\]|\\.)*)","foreign_name":"((?:[^"\\]|\\.)*)"(?:(?!"name":")[\s\S])*?"menu_price":"([0-9.]+)"/g;

  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function jsonDecode(s) { try { return JSON.parse('"' + s + '"'); } catch (e) { return s; } }

  function matches(url) {
    try { return /(^|\.)chowbus\.com$/.test(new URL(url, "http://x").hostname); }
    catch (e) { return false; }
  }

  // Reassemble the decoded Flight payload from all __next_f script chunks.
  function flightPayload(root) {
    var blob = "";
    var scripts = root.querySelectorAll("script");
    Array.prototype.forEach.call(scripts, function (s) {
      var t = s.textContent || "";
      if (t.indexOf("__next_f") === -1) return;
      PUSH_RE.lastIndex = 0;
      var m;
      while ((m = PUSH_RE.exec(t)) !== null) {
        try { blob += JSON.parse('"' + m[1] + '"'); } catch (e) { /* skip a malformed chunk */ }
      }
    });
    return blob;
  }

  // Extract every meal across every menu from the decoded payload. Deduped by
  // the joined EN + 中文 name.
  function mealsFrom(payload) {
    var acc = {}, order = [];
    MEAL_RE.lastIndex = 0;
    var m;
    while ((m = MEAL_RE.exec(payload)) !== null) {
      var en = jsonDecode(m[1]), cn = jsonDecode(m[2]);
      var name = [norm(en), norm(cn)].filter(Boolean).join(" ");
      var price = parseFloat(m[3]);
      if (!name || !Number.isFinite(price) || price < 0) continue;
      if (name in acc) continue;
      acc[name] = price;
      order.push(name);
    }
    return order.map(function (n) { return { name: n, price: acc[n] }; });
  }

  // Async: the Flight scripts are in the server-rendered HTML so they're present
  // on load, but in the gather the page may still be streaming chunks — so we
  // retry briefly until meals appear (or give up). No scroll/click needed.
  async function readMenu(root) {
    root = root || document;
    var t0 = Date.now();
    var items = mealsFrom(flightPayload(root));
    while (items.length === 0 && Date.now() - t0 < 5000) {
      await sleep(300);
      items = mealsFrom(flightPayload(root));
    }
    return items;
  }

  var adapter = {
    backend: "Chowbus", matches: matches, readMenu: readMenu,
    // exposed for unit tests
    flightPayload: flightPayload, mealsFrom: mealsFrom
  };
  global.CheapBiteAdapters = global.CheapBiteAdapters || {};
  global.CheapBiteAdapters.chowbus = adapter;
})(typeof window !== "undefined" ? window : this);
