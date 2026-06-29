// families.js — Provider/Backend → ownership family + adapter routing (ADR-0012).
//
// Turns the raw discovery output into a gather plan: which single Channel to
// read per ownership family (deduping corporate siblings), which Adapter reads
// each, and which Channels we can't compare yet (no Adapter built).
//
// Content-script scope: exposes window.CheapBiteFamilies.
"use strict";

(function (global) {
  // Aggregator Provider (display name) → ownership family.
  var PROVIDER_FAMILY = {
    "Uber Eats": "uber", "Postmates": "uber",
    "DoorDash": "doordash", "Caviar": "doordash",
    "Grubhub": "grubhub", "Seamless": "grubhub",
    "Fantuan": "fantuan",
    "HungryPanda": "hungrypanda"
  };

  // The brand we prefer to actually Gather per family (the marketplace whose
  // page reads most reliably), regardless of the order Google lists siblings.
  var CANONICAL = { uber: "Uber Eats", doordash: "DoorDash", grubhub: "Grubhub", fantuan: "Fantuan", hungrypanda: "HungryPanda" };

  // Which built Adapter reads a family / Direct backend. null = not built yet.
  var FAMILY_ADAPTER = { doordash: "doordash", uber: "ubereats", grubhub: "grubhub", fantuan: "fantuan", hungrypanda: "hungrypanda" };

  // Per-adapter read budget (ms). JSON-LD reads are instant; Grubhub scrolls a
  // virtualized list, so it needs a much longer window. Consumed by the gather.
  var ADAPTER_READ_MS = { grubhub: 16000, storefront: 16000, // both scroll a virtualized list
    mealkeyway: 12000, chownow: 12000, grubhubdirect: 12000 }; // SPAs — need time to boot + render in a bg tab
  function readMsFor(adapter) { return ADAPTER_READ_MS[adapter] || 6000; }

  // Focus is no longer hardcoded per adapter — the gather foregrounds a tab
  // adaptively when a background read comes back thin (ADR-0014).
  var BACKEND_ADAPTER = {
    "Clover": "clover",
    "Toast": "toast",
    "DoorDash Storefront": "storefront", // order.online — commission-free Direct
    "Chowbus": "chowbus",                // pos.chowbus.com — commission-free Direct
    "MealKeyway": "mealkeyway",          // order.mealkeyway.com (MenuSifu) — commission-free Direct
    "BeyondMenu": "beyondmenu",          // beyondmenu.com — Direct (flat $0.99 service fee)
    "ChowNow": "chownow",                // chownow.com / direct.chownow.com — commission-free Direct
    "Grubhub Direct": "grubhubdirect",   // *.dine.online — Grubhub's white-label own-ordering
    "Square": null, "Olo": null,
    "unknown": null
  };

  // discovery = { providers:[{name,url}], directCandidates:[{backend,url,host}] }
  // → { jobs:[{key,url,adapter,isDirect,backend?,readMs}], unsupported:[{key,reason}] }
  // No privileged baseline — every gatherable Channel is a job, and the cheapest
  // readable one becomes the baseline downstream (ADR-0013).
  function planGather(discovery) {
    var unsupported = [];
    var jobs = [];

    // Every Direct candidate we have an Adapter for is gatherable. Dedupe by
    // key — a restaurant often lists the same backend twice (e.g. two Toast
    // URLs); they're the same menu, so gather once.
    var seenDirect = {};
    (discovery.directCandidates || []).forEach(function (d) {
      var known = d.backend && d.backend !== "unknown";
      var key = known ? "Direct · " + d.backend : "Direct (" + (d.host || "own site") + ")";
      if (seenDirect[key]) return;
      seenDirect[key] = true;
      var adapter = BACKEND_ADAPTER[d.backend] || null;
      if (!adapter) { unsupported.push({ key: key, reason: "no adapter yet", fee: d.fee }); return; }
      jobs.push({ key: key, url: d.url, adapter: adapter, isDirect: true, backend: d.backend,
        readMs: readMsFor(adapter), fee: d.fee });
    });

    // One canonical aggregator per ownership family.
    var byFamily = {};
    (discovery.providers || []).forEach(function (p) {
      var fam = PROVIDER_FAMILY[p.name];
      if (!fam) { unsupported.push({ key: p.name, reason: "unknown provider" }); return; }
      (byFamily[fam] = byFamily[fam] || []).push(p);
    });
    Object.keys(byFamily).forEach(function (fam) {
      var list = byFamily[fam];
      // Prefer the canonical brand; fall back to whatever was listed.
      var chosen = list.filter(function (p) { return p.name === CANONICAL[fam]; })[0] || list[0];
      var adapter = FAMILY_ADAPTER[fam];
      if (!adapter) { unsupported.push({ key: chosen.name, reason: "no adapter yet" }); return; }
      jobs.push({ key: chosen.name, url: chosen.url, adapter: adapter, isDirect: false, family: fam,
        readMs: readMsFor(adapter), fee: chosen.fee });
    });

    return { jobs: jobs, unsupported: unsupported };
  }

  global.CheapBiteFamilies = { planGather: planGather, PROVIDER_FAMILY: PROVIDER_FAMILY };
})(typeof window !== "undefined" ? window : this);
