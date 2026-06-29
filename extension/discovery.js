// discovery.js — DOM-pure discovery helpers for CheapBite (Phase 0).
//
// Loaded before content.js in the same isolated content-script scope, so
// content.js can call window.CheapBiteDiscovery.discoverChannels(). Functions
// accept a `root` so they can be unit-tested against saved-HTML fixtures.
//
// Discovery runs on Google's "Order online" provider page (.../searchviewer/*),
// NOT the Maps place page — that's where the ordering links live (see ADR-0008).
// On that page each option is a plain <a> whose href is the provider's real
// domain. We classify each as either an aggregator Provider or a Direct backend;
// the restaurant's own row carries a "Preferred by business" badge.
"use strict";

(function (global) {
  // Aggregator marketplaces (third-party Providers). Matched by domain suffix.
  var AGGREGATORS = [
    { name: "Uber Eats", host: "ubereats.com" },
    { name: "Postmates", host: "postmates.com" },
    { name: "DoorDash", host: "doordash.com" },
    { name: "Caviar", host: "trycaviar.com" },
    { name: "Grubhub", host: "grubhub.com" },
    { name: "Seamless", host: "seamless.com" },
    { name: "Fantuan", host: "fantuanorder.com" },
    { name: "HungryPanda", host: "hungrypanda.co" }
  ];

  // Own-site ("Direct") ordering backends — usually the cheapest Channel.
  var DIRECT_BACKENDS = [
    { backend: "Clover", host: "clover.com" },
    { backend: "DoorDash Storefront", host: "order.online" },
    { backend: "Toast", host: "toasttab.com" },
    // Chowbus's commission-free POS only (the restaurant's own ordering); the
    // bare chowbus.com consumer marketplace is intentionally NOT a Direct host.
    { backend: "Chowbus", host: "pos.chowbus.com" },
    { backend: "MealKeyway", host: "mealkeyway.com" }, // MenuSifu POS own-ordering
    { backend: "BeyondMenu", host: "beyondmenu.com" }, // flat $0.99 service fee (see parseServiceFee)
    { backend: "Grubhub Direct", host: "dine.online" }, // Grubhub's white-label own-ordering (NOT grubhub.com)
    { backend: "Square", host: "square.site" },
    { backend: "Square", host: "squareup.com" },
    { backend: "ChowNow", host: "chownow.com" },
    { backend: "Olo", host: "olo.com" }
  ];

  // Hosts that are never the restaurant's own Direct site.
  var NON_WEBSITE_HOSTS = [
    "google.com", "goo.gl", "gstatic.com", "facebook.com", "instagram.com",
    "twitter.com", "x.com", "youtube.com", "yelp.com", "tripadvisor.com"
  ];

  // querySelectorAll that also recurses into open shadow roots.
  function deepQueryAll(selector, root) {
    root = root || document;
    var els = Array.prototype.slice.call(root.querySelectorAll(selector));
    root.querySelectorAll("*").forEach(function (el) {
      if (el.shadowRoot) els = els.concat(deepQueryAll(selector, el.shadowRoot));
    });
    return els;
  }

  function findAllAnchors(root) {
    return deepQueryAll("a[href]", root);
  }

  function hostOf(url) {
    try { return new URL(url, location.href).hostname.toLowerCase(); }
    catch (e) { return ""; }
  }

  function hostMatches(host, suffix) {
    return host === suffix || host.endsWith("." + suffix);
  }

  function isExcludedHost(host) {
    if (NON_WEBSITE_HOSTS.some(function (h) { return host.indexOf(h) !== -1; })) return true;
    return AGGREGATORS.some(function (a) { return hostMatches(host, a.host); });
  }

  // The href itself plus any http(s) URL embedded in common redirect params —
  // Google sometimes wraps outbound links (e.g. ?url=, ?q=, /aclk?adurl=).
  function candidateUrls(href) {
    var out = [href];
    try {
      var u = new URL(href, location.href);
      ["url", "q", "continue", "adurl", "dest", "ru"].forEach(function (key) {
        var v = u.searchParams.get(key);
        if (v && /^https?:/i.test(v)) out.push(v);
      });
    } catch (e) { /* unparseable href — ignore */ }
    return out;
  }

  // First {entry, url, host} whose host matches an entry in `table` (by .host).
  function classify(href, table) {
    var cands = candidateUrls(href);
    for (var i = 0; i < cands.length; i++) {
      var host = hostOf(cands[i]);
      for (var j = 0; j < table.length; j++) {
        if (hostMatches(host, table[j].host)) {
          return { entry: table[j], url: cands[i], host: host };
        }
      }
    }
    return null;
  }

  // The "Preferred by business" badge lives inside the restaurant's own row,
  // which is a single anchor — so check the anchor's own text (no ancestor
  // walk, which previously produced false positives on neighbouring rows).
  function isPreferred(a) {
    return /preferred by business/i.test(a.textContent || "");
  }

  // Google's searchviewer shows each channel's pickup service fee in the row
  // text — "No fee" or e.g. "Service fee $0.99". We capture it so the overlay can
  // disclose a fee (e.g. BeyondMenu's flat $0.99). Returns the fee in dollars,
  // 0 for "No fee", or null when the row doesn't state one. NOTE: the row text is
  // concatenated without spaces ("HungryPandaNo feeReady in 15 min"), so we match
  // the phrases as plain substrings — no word boundaries.
  function parseServiceFee(text) {
    text = text || "";
    var m = text.match(/service fee\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    if (m) return parseFloat(m[1]);
    if (/no fee/i.test(text)) return 0;
    return null;
  }

  // The Maps "Website" link → a generic Direct candidate (fallback for the
  // place-page case; the searchviewer surfaces the own-site row directly).
  function findWebsiteLink(root) {
    var anchors = findAllAnchors(root);
    var cand = anchors.find(function (a) {
      return (a.getAttribute("data-item-id") || "").indexOf("authority") !== -1;
    });
    if (!cand) {
      cand = anchors.find(function (a) {
        var label = ((a.getAttribute("aria-label") || "") + " " +
                     (a.textContent || "")).toLowerCase();
        return /\bwebsite\b/.test(label);
      });
    }
    if (!cand) return null;
    var host = hostOf(cand.href);
    if (!host || isExcludedHost(host)) return null;
    return { name: "Direct", backend: "unknown", url: cand.href, host: host, source: "website-link", preferred: false };
  }

  // Best-effort: reveal a lazy-loaded "Order online" panel by clicking it.
  function tryOpenOrderPanel(root) {
    var controls = deepQueryAll('button,[role="button"],a', root);
    var control = controls.find(function (el) {
      var label = ((el.getAttribute("aria-label") || "") + " " +
                   (el.textContent || "")).toLowerCase().trim();
      return /order online|place an order|order pickup|order delivery|^order$/.test(label);
    });
    if (control) { control.click(); return true; }
    return false;
  }

  // { providers: [{name,url,host}],
  //   direct: {name,backend,url,host,source,preferred}|null,
  //   directCandidates: [direct, ...] }
  function discoverChannels(root) {
    root = root || document;
    var providersByName = {};
    var directByHost = {};

    findAllAnchors(root).forEach(function (a) {
      var fee = parseServiceFee(a.textContent);
      var agg = classify(a.href, AGGREGATORS);
      if (agg) {
        if (!providersByName[agg.entry.name]) {
          providersByName[agg.entry.name] = { name: agg.entry.name, url: agg.url, host: agg.host, fee: fee };
        }
        return;
      }
      var dir = classify(a.href, DIRECT_BACKENDS);
      if (dir) {
        if (!directByHost[dir.host]) {
          directByHost[dir.host] = {
            name: "Direct", backend: dir.entry.backend, url: dir.url, host: dir.host,
            source: "panel", preferred: isPreferred(a), fee: fee
          };
        }
        return;
      }
      // The restaurant's own ordering row (e.g. its website) isn't a known
      // backend, but the "Preferred by business" badge marks it as Direct.
      if (isPreferred(a)) {
        var h = hostOf(a.href);
        if (h && !isExcludedHost(h) && !directByHost[h]) {
          directByHost[h] = {
            name: "Direct", backend: "unknown", url: a.href, host: h,
            source: "panel", preferred: true, fee: fee
          };
        }
      }
    });

    var directCandidates = Object.keys(directByHost).map(function (k) { return directByHost[k]; });
    // Fall back to the Maps "Website" link only if nothing else surfaced.
    if (directCandidates.length === 0) {
      var web = findWebsiteLink(root);
      if (web) directCandidates.push(web);
    }
    var direct = directCandidates.filter(function (d) { return d.preferred; })[0]
              || directCandidates[0] || null;

    return {
      providers: Object.keys(providersByName).map(function (k) { return providersByName[k]; }),
      direct: direct,
      directCandidates: directCandidates
    };
  }

  global.CheapBiteDiscovery = {
    deepQueryAll: deepQueryAll,
    findAllAnchors: findAllAnchors,
    findWebsiteLink: findWebsiteLink,
    tryOpenOrderPanel: tryOpenOrderPanel,
    discoverChannels: discoverChannels,
    parseServiceFee: parseServiceFee
  };
})(typeof window !== "undefined" ? window : this);
