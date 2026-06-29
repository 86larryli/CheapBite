// background.js — CheapBite service worker: the Gather orchestrator (ADR-0010).
//
// Only the service worker can open tabs and inject across origins, so the
// searchviewer content script hands it a list of jobs over a port; for each
// job it opens a background tab, injects the Adapter + a short read runner,
// and streams progress + results back. Sequential (gentle on anti-bot, clean
// co-pilot handoff later — ADR-0011). No cache yet (Phase 2).
//
// Reading strategy: rather than injecting once on first load, we re-inject and
// re-read every ~700ms until items appear or a deadline. That rides through
// client-side redirects (e.g. clover.com → *.cloveronline.com) and slow SPA
// rendering without guessing the right single moment to read.
"use strict";

chrome.runtime.onInstalled.addListener(function () {
  console.log("[CheapBite] installed — gather orchestrator active.");
});

// A real menu has many items; a transitional/redirector page (e.g. clover.com
// before it bounces to *.cloveronline.com) may expose 1 stray price. Require a
// floor before accepting a read so we don't lock onto the wrong page.
var MIN_ITEMS = 5;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// Bound a promise — a script injected just before a redirect can be torn down
// with its executeScript promise left pending forever, which would hang the
// whole gather. Racing a timeout lets the loop retry on the settled page.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (_, rej) { setTimeout(function () { rej(new Error("inject-timeout")); }, ms); })
  ]);
}
function getTab(tabId) {
  return new Promise(function (resolve) {
    try { chrome.tabs.get(tabId, function (t) { resolve(chrome.runtime.lastError ? null : t); }); }
    catch (e) { resolve(null); }
  });
}

// Runs INSIDE the gathered page — executeScript serializes it, so it may use
// ONLY its arguments + page globals, never close over background.js vars.
// Reads the menu, polling briefly to let a just-rendered DOM settle. (A slow
// async readMenu — e.g. Grubhub's scroll — resolves on the first pass via the
// deadline branch, returning ok when it has cleared the item floor.)
function cbReadOnce(adapterId, minItems) {
  return new Promise(function (resolve) {
    var reg = (window.CheapBiteAdapters || {})[adapterId];
    if (!reg) { resolve({ status: "no-adapter", items: [] }); return; }
    var deadline = Date.now() + 2500;
    var prev = -1;
    function tick() {
      Promise.resolve()
        .then(function () { return reg.readMenu(document); })
        .catch(function () { return []; })
        .then(function (items) {
          items = items || [];
          // Accept once the count is past the floor and stable, or time's up.
          if (items.length >= minItems && items.length === prev) { resolve({ status: "ok", items: items }); return; }
          prev = items.length;
          if (Date.now() >= deadline) { resolve({ status: items.length >= minItems ? "ok" : "empty", items: items }); return; }
          setTimeout(tick, 350);
        });
    }
    tick();
  });
}

async function gatherOnce(job, senderTab, focused) {
  var tab;
  try {
    // Gathers run hidden by default; `focused` foregrounds the tab so a
    // virtualized list will actually render while we scroll (ADR-0014).
    tab = await chrome.tabs.create({
      url: job.url,
      active: !!focused,
      windowId: senderTab ? senderTab.windowId : undefined
    });
    // Per-job ceiling scaled to the adapter's read budget — a failing fast
    // adapter (e.g. a Storefront with no JSON-LD) gives up quickly instead of
    // spinning the full window; Grubhub's slow scroll still gets its room.
    var deadline = Date.now() + Math.max((job.readMs || 6000) + 6000, 12000);
    var lastStatus = "timeout";
    while (Date.now() < deadline) {
      await sleep(700);
      var t = await getTab(tab.id);
      if (!t || t.status !== "complete") continue; // still loading / redirecting
      try {
        await withTimeout(chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["adapters/" + job.adapter + ".js"] }), 5000);
        // readMenu can be slow (Grubhub scrolls a virtualized list), so the
        // read injection gets the job's own budget; the file inject stays short.
        var res = await withTimeout(chrome.scripting.executeScript({ target: { tabId: tab.id }, func: cbReadOnce, args: [job.adapter, MIN_ITEMS] }), (job.readMs || 6000) + 2000);
        var out = (res && res[0] && res[0].result) || { status: "empty", items: [] };
        lastStatus = out.status;
        if (out.status === "ok") return { key: job.key, status: "ok", items: out.items };
      } catch (e) {
        lastStatus = "error"; // page likely mid-navigation (redirect) — retry
      }
    }
    return { key: job.key, status: lastStatus === "ok" ? "ok" : "timeout", items: [] };
  } catch (e) {
    return { key: job.key, status: "error", items: [], error: String((e && e.message) || e) };
  } finally {
    if (tab && tab.id != null) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
    // Restore the user's tab if we stole focus for a foregrounded gather.
    if (focused && senderTab && senderTab.id != null) {
      try { await chrome.tabs.update(senderTab.id, { active: true }); } catch (e) {}
    }
  }
}

// A real menu has many items; a thin read signals a virtualized list that
// didn't render in the hidden tab — worth a focused retry (ADR-0014).
var THIN_ITEMS = 10;

// Adapters whose menu is a VIRTUALIZED list: a hidden tab pauses rendering
// (rAF throttled), so the scroll-accumulate can't advance past the first
// viewport (~12–25 items). A background read would clear THIN_ITEMS on that
// partial viewport and never retry — so we read these in a focused tab from
// the start, where the scroll actually loads the full menu (ADR-0014).
var VIRTUALIZED = { grubhub: true, storefront: true };

async function gatherJob(job, senderTab) {
  if (VIRTUALIZED[job.adapter]) return await gatherOnce(job, senderTab, true);
  var bg = await gatherOnce(job, senderTab, false);
  if (bg.status === "ok" && bg.items.length >= THIN_ITEMS) return bg;
  // Thin/failed in the background → retry this one Channel focused so it can
  // render, then keep whichever pass read more.
  var fg = await gatherOnce(job, senderTab, true);
  return fg.items.length >= bg.items.length ? fg : bg;
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== "cheapbite") return;
  var senderTab = port.sender && port.sender.tab; // the user's searchviewer tab
  port.onMessage.addListener(async function (msg) {
    if (!msg || msg.type !== "GATHER") return;
    var jobs = msg.jobs || [];
    var results = [];
    for (var i = 0; i < jobs.length; i++) {
      try { port.postMessage({ type: "progress", index: i, total: jobs.length, key: jobs[i].key }); } catch (e) {}
      results.push(await gatherJob(jobs[i], senderTab));
    }
    try { port.postMessage({ type: "done", results: results }); } catch (e) {}
  });
});
