// content.js — CheapBite orchestration UI.
//
// Two surfaces (ADR-0008):
//  - Google Maps place listing (/maps/place/): inject the "Compare pickup
//    prices" button, which opens Google's "Order online" → a /searchviewer/
//    provider page (usually a new tab).
//  - The /searchviewer/ page: discover Channels, plan the Gather (dedupe by
//    family + pick Baseline), ask the service worker to read each menu in a
//    background tab, then compute and render the Upcharge.
"use strict";

(function () {
  var BTN_ID = "cheapbite-compare-btn";
  var OVERLAY_ID = "cheapbite-overlay";
  var D = window.CheapBiteDiscovery;
  var F = window.CheapBiteFamilies;
  var C = window.CheapBiteCompare;
  var ranForHref = null;

  function isRestaurantPlace() { return location.pathname.indexOf("/maps/place/") !== -1; }
  function isSearchviewer() { return location.pathname.indexOf("/searchviewer") !== -1; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function removeEl(id) { var el = document.getElementById(id); if (el) el.remove(); }

  // ---- Maps place: the trigger button ----
  function injectButton() {
    if (document.getElementById(BTN_ID)) return; // idempotent
    var btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "Compare pickup prices";
    btn.addEventListener("click", function () {
      if (!D.tryOpenOrderPanel(document)) {
        console.warn("[CheapBite] no 'Order online' control found on this listing.");
      }
    });
    document.body.appendChild(btn);
  }

  // ---- searchviewer: discover → plan → gather → compare → render ----
  async function runSearchviewer() {
    if (ranForHref === location.href) return; // once per page
    ranForHref = location.href;

    // Discovery links render async; poll until they appear (up to ~5s).
    var channels = D.discoverChannels(document);
    for (var i = 0; i < 20; i++) {
      if (channels.providers.length > 0 || channels.directCandidates.length > 0) break;
      await sleep(250);
      channels = D.discoverChannels(document);
    }

    var plan = F.planGather(channels);
    console.log("[CheapBite] gather plan:", plan);

    if (!plan.jobs.length) { renderMessage("No ordering channel CheapBite can read yet for this restaurant.", plan); return; }

    // Don't gather automatically — the gather opens background tabs and briefly
    // focuses one, so it only runs when the user clicks the CTA (ADR-0015).
    renderCTA(plan);
  }

  function renderCTA(plan) {
    var box = overlayShell("CheapBite");
    var n = plan.jobs.length;
    addLine(box, "cheapbite-sub",
      "Compare pickup prices across " + n + " option" + (n === 1 ? "" : "s") + " to find the cheapest.");
    var btn = document.createElement("button");
    btn.id = "cheapbite-start-btn";
    btn.type = "button";
    btn.className = "cheapbite-start";
    btn.textContent = "Compare prices";
    btn.addEventListener("click", function () { startComparison(plan); });
    box.appendChild(btn);
  }

  function startComparison(plan) {
    renderProgress(plan, plan.jobs.length);
    var port = chrome.runtime.connect({ name: "cheapbite" });
    port.onMessage.addListener(function (msg) {
      if (msg.type === "progress") {
        setProgress(msg.index + 1, msg.total, msg.key);
      } else if (msg.type === "done") {
        finish(plan, msg.results);
        try { port.disconnect(); } catch (e) {}
      }
    });
    port.onDisconnect.addListener(function () { /* SW asleep / error — leave last UI */ });
    port.postMessage({ type: "GATHER", jobs: plan.jobs });
  }

  function finish(plan, results) {
    var byKey = {};
    results.forEach(function (r) { byKey[r.key] = r; });

    // Every Channel we actually read, tagged Direct/aggregator from the plan.
    var channels = plan.jobs
      .filter(function (j) { var r = byKey[j.key]; return r && r.status === "ok" && r.items && r.items.length; })
      .map(function (j) { return { key: j.key, isDirect: !!j.isDirect, backend: j.backend, menu: byKey[j.key].items }; });

    if (channels.length === 0) {
      renderMessage("Couldn't read any ordering channel for this restaurant.", plan, results);
      return;
    }

    // Per-channel pickup service fee (from Google's searchviewer, e.g. BeyondMenu
    // $0.99). Disclosed as a note in the overlay — not folded into the subtotal
    // ranking (ADR-0009). Keyed by job key so renderResults can look it up.
    var feeByKey = {};
    plan.jobs.forEach(function (j) { if (j.fee) feeByKey[j.key] = j.fee; });

    // Rank vs the cheapest readable Channel — Direct preferred, not required (ADR-0013).
    renderResults(plan, C.rankByCheapest(channels), byKey, results, feeByKey);
  }

  // ---- Rendering ----
  function overlayShell(titleText) {
    removeEl(OVERLAY_ID);
    var box = document.createElement("div");
    box.id = OVERLAY_ID;
    var header = document.createElement("div");
    header.className = "cheapbite-header";
    var title = document.createElement("strong");
    title.textContent = titleText;
    var close = document.createElement("button");
    close.className = "cheapbite-close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", function () { removeEl(OVERLAY_ID); });
    header.appendChild(title);
    header.appendChild(close);
    box.appendChild(header);
    document.body.appendChild(box);
    return box;
  }

  function addLine(box, cls, text) {
    var d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    box.appendChild(d);
    return d;
  }

  function renderProgress(plan, total) {
    var box = overlayShell("CheapBite — comparing…");
    var p = addLine(box, "cheapbite-sub", "Reading menus… (0 of " + total + ")");
    p.id = "cheapbite-progress";
  }
  function setProgress(done, total, key) {
    var p = document.getElementById("cheapbite-progress");
    if (p) p.textContent = "Reading " + key + "… (" + done + " of " + total + ")";
  }

  function renderMessage(text, plan, results) {
    var box = overlayShell("CheapBite");
    addLine(box, "cheapbite-sub", text);
    if (plan) appendUnsupported(box, plan, results);
  }

  function pctLabel(s) {
    if (s.medianPct == null) return "—";
    var sign = s.medianPct >= 0 ? "+" : "";
    return sign + s.medianPct.toFixed(1) + "%";
  }

  // A row's display name: Direct channels read as "Order direct (<backend>)".
  function channelLabel(r) {
    if (r.isDirect) return "Order direct" + (r.backend && r.backend !== "unknown" ? " (" + r.backend + ")" : "");
    return r.key;
  }

  function feeNote(fee) {
    return "Plus a $" + fee.toFixed(2) + " service fee (per Google)";
  }

  function renderResults(plan, result, byKey, results, feeByKey) {
    feeByKey = feeByKey || {};
    var box = overlayShell("CheapBite — pickup price comparison");
    addLine(box, "cheapbite-sub", "Before discounts, taxes & fees · prices read just now");

    // What the cheapest (baseline) is, for the "more than …" phrasing.
    var baselineNoun = result.baselineIsDirect ? "direct" : "the cheapest";
    var hasTies = result.ranked.some(function (r) { return !r.isBaseline && r.tied; });

    result.ranked.forEach(function (r) {
      var s = r.summary;
      var row = document.createElement("div");
      row.className = "cheapbite-row" + (r.isBaseline || r.tied ? " cheapbite-baseline" : "");
      var right;
      if (r.isBaseline) right = hasTies ? "cheapest (tied)" : "cheapest";
      else if (r.tied) right = "same price";
      else right = pctLabel(s) + rangeStr(s);
      row.innerHTML =
        '<span class="cheapbite-row-name">' + channelLabel(r) + '</span>' +
        '<span class="cheapbite-pct">' + right + '</span>';
      box.appendChild(row);
      if (r.isBaseline) {
        if (r.solo) addLine(box, "cheapbite-evidence", "Only channel we could read — nothing to compare against yet.");
      } else if (r.tied) {
        addLine(box, "cheapbite-evidence", "Same price as " + baselineNoun + " · " + s.n + " items matched");
      } else {
        var warn = s.consistent ? "" : " ⚠︎ inconsistent";
        addLine(box, "cheapbite-evidence",
          "≈ " + pctLabel(s) + " more than " + baselineNoun + " · " + s.n + " items matched" + warn);
      }
      // Disclose a flat pickup service fee (e.g. BeyondMenu $0.99) — especially
      // important when this channel is the "cheapest" baseline.
      if (feeByKey[r.key]) addLine(box, "cheapbite-fee", feeNote(feeByKey[r.key]));
    });

    appendFlaggedGathers(box, plan, byKey);
    appendUnsupported(box, plan, results);
  }

  function rangeStr(s) {
    return (s.lowPct != null && s.highPct != null)
      ? " (" + s.lowPct.toFixed(1) + "–" + s.highPct.toFixed(1) + "%)" : "";
  }

  // Channels we tried to gather but couldn't read cleanly (ADR-0011).
  function appendFlaggedGathers(box, plan, byKey) {
    var flagged = plan.jobs
      .filter(function (j) { var r = byKey[j.key]; return !r || r.status !== "ok" || !r.items.length; })
      .map(function (j) { return j.key + " (" + (byKey[j.key] ? byKey[j.key].status : "no result") + ")"; });
    if (flagged.length) addLine(box, "cheapbite-flag", "Couldn't read: " + flagged.join(", "));
  }

  // Channels we didn't attempt — no adapter yet, or deduped sibling.
  function appendUnsupported(box, plan, results) {
    var noAdapter = (plan.unsupported || [])
      .filter(function (u) { return u.reason === "no adapter yet"; })
      .map(function (u) { return u.key; });
    if (noAdapter.length) addLine(box, "cheapbite-flag", "Not compared yet (adapter coming): " + noAdapter.join(", "));
  }

  // ---- Detection + SPA navigation handling ----
  function refresh() {
    if (isSearchviewer()) {
      runSearchviewer();
    } else if (isRestaurantPlace()) {
      injectButton();
    } else {
      removeEl(BTN_ID);
      removeEl(OVERLAY_ID);
      ranForHref = null;
    }
  }

  var lastHref = location.href;
  function tick() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      ranForHref = null;
      removeEl(OVERLAY_ID); // belonged to the previous page
    }
    refresh();
  }

  // Google Maps is an SPA whose DOM mutates continuously, which can starve a
  // debounced MutationObserver so it never fires. A steady, cheap poll is the
  // robust way to notice navigation; refresh()/injectButton() are idempotent.
  window.addEventListener("popstate", tick);
  window.addEventListener("hashchange", tick);
  setInterval(tick, 700);
  tick(); // initial pass
})();
