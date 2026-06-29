// compare.js — matching + Upcharge computation for CheapBite (Phase 1c).
//
// Pure JS (no DOM): operates on the {name, price} arrays the Adapters return.
// Matches each target Channel's menu against the Baseline (Direct), then
// estimates how much pricier the Channel runs — the Upcharge (ADR-0009).
//
// Matching: normalize names, accept exact-normalized as confident, else fall
// back to a bigram Dice similarity threshold. The full POS-derived name
// (including any leading "NN -" code) is kept, since it disambiguates items
// that share a fragment (three different "Wine Sauce Oxtail …" dishes). Items
// that don't match confidently are excluded — never guessed (ADR-0003).
// Names that mix scripts (e.g. "crab roe noodles 蟹黄拌面") are also scored
// per shared script (CJK / Latin) so a platform carrying only one script still
// matches — see similarity().
//
// Upcharge: median of per-item price ratios − 1, over ALL confident matches
// (not a fixed 3–5) for robustness; reported with an IQR range. A consistency
// guard flags the rare case where matched items disagree on direction.
"use strict";

(function (global) {
  var DEFAULT_THRESHOLD = 0.85;
  var TOL = 0.005; // treat ratios within ±0.5% of 1.0 as "same price"
  var TIE_PCT = 0.5; // a Channel within this % of the cheapest is "tied", not pricier

  function normalizeName(s) {
    s = (s || "");
    if (s.normalize) s = s.normalize("NFKC");
    return s.toLowerCase().replace(/\s+/g, " ").trim();
  }

  // Character-bigram multiset → Dice coefficient (Sørensen–Dice). Robust to
  // word order and small edits; 1.0 = identical, 0 = nothing in common.
  function bigrams(s) {
    var out = {};
    for (var i = 0; i < s.length - 1; i++) {
      var g = s.slice(i, i + 2);
      out[g] = (out[g] || 0) + 1;
    }
    return out;
  }
  function diceCoefficient(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    var A = bigrams(a), B = bigrams(b), overlap = 0, total = 0, g;
    for (g in A) total += A[g];
    for (g in B) {
      total += B[g];
      if (A[g]) overlap += Math.min(A[g], B[g]);
    }
    return (2 * overlap) / total;
  }

  // A name can mix scripts ("crab roe noodles 蟹黄拌面") while the SAME dish on
  // another platform carries only one of them ("Crab Roe Noodles"). Scoring the
  // whole mixed string lets the orphaned script's bigrams dilute the score below
  // threshold, dropping a correct match. So we ALSO score each shared script in
  // isolation (CJK-vs-CJK, Latin-vs-Latin) and keep the best. This is a
  // CJK/Latin de-noiser — it does NOT separate same-script languages (Spanish
  // stays in the Latin bucket with English; a translated name like
  // "Grilled Octopus"/"Pulpo a la Parrilla" is a different, unsolved problem).
  // Because we take the MAX with the full-string score, similarity can only
  // rise, so this recovers diluted matches without weakening any the
  // full-string matcher already accepted.
  var CJK_RE = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힣]/;

  // Split a normalized name into its CJK characters and everything else (Latin
  // letters, digits, punctuation); Latin whitespace is recollapsed.
  function scriptParts(s) {
    var cjk = "", other = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (CJK_RE.test(ch)) cjk += ch; else other += ch;
    }
    return { cjk: cjk, latin: other.replace(/\s+/g, " ").trim() };
  }
  // A Latin segment "counts" only with real lettering — guards against two
  // items matching on a stray "(6)" left behind once their CJK is stripped.
  function hasLatin(s) { return (s.match(/[a-z]/g) || []).length >= 2; }

  function similarity(a, b) {
    var na = normalizeName(a), nb = normalizeName(b);
    if (na === nb) return 1;
    var best = diceCoefficient(na, nb); // full-string baseline
    var pa = scriptParts(na), pb = scriptParts(nb);
    if (pa.cjk && pb.cjk) best = Math.max(best, diceCoefficient(pa.cjk, pb.cjk));
    if (hasLatin(pa.latin) && hasLatin(pb.latin)) {
      best = Math.max(best, diceCoefficient(pa.latin, pb.latin));
    }
    return best;
  }

  // Greedy 1:1 match of baseline items to target items. For each baseline item
  // we take its best-scoring unused target item above `threshold`.
  // Returns [{ name, baselinePrice, targetPrice, score }].
  function matchMenus(baseline, target, threshold) {
    threshold = threshold == null ? DEFAULT_THRESHOLD : threshold;
    var used = new Array(target.length).fill(false);
    var matches = [];
    baseline.forEach(function (b) {
      var bestI = -1, bestScore = 0;
      for (var i = 0; i < target.length; i++) {
        if (used[i]) continue;
        var sc = similarity(b.name, target[i].name);
        if (sc > bestScore) { bestScore = sc; bestI = i; }
      }
      if (bestI >= 0 && bestScore >= threshold) {
        used[bestI] = true;
        matches.push({
          name: b.name,
          baselinePrice: b.price,
          targetPrice: target[bestI].price,
          score: bestScore
        });
      }
    });
    return matches;
  }

  function quantile(sorted, q) {
    if (sorted.length === 0) return null;
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // Summarize matches into an Upcharge estimate vs the baseline.
  // Only pairs with a positive baseline price contribute a ratio.
  function summarizeUpcharge(matches) {
    var ratios = matches
      .filter(function (m) { return m.baselinePrice > 0 && m.targetPrice >= 0; })
      .map(function (m) { return m.targetPrice / m.baselinePrice; })
      .sort(function (x, y) { return x - y; });

    if (ratios.length === 0) {
      return { n: 0, medianPct: null, lowPct: null, highPct: null, consistent: false };
    }
    var median = quantile(ratios, 0.5);
    var p25 = quantile(ratios, 0.25);
    var p75 = quantile(ratios, 0.75);

    // Consistency: how many ratios disagree with the median's direction.
    var up = 0, down = 0;
    ratios.forEach(function (r) {
      if (r > 1 + TOL) up++; else if (r < 1 - TOL) down++;
    });
    var medianUp = median > 1 + TOL, medianDown = median < 1 - TOL;
    var against = medianUp ? down : (medianDown ? up : 0);
    var consistent = ratios.length > 0 && (against / ratios.length) <= 0.2;

    var pct = function (r) { return Math.round((r - 1) * 1000) / 10; }; // 1 decimal
    return {
      n: ratios.length,
      medianPct: pct(median),
      lowPct: pct(p25),
      highPct: pct(p75),
      consistent: consistent,
      up: up,
      down: down
    };
  }

  // Compare a baseline menu against one or more target Channels.
  // channels: [{ key, menu: [{name,price}] }]. Returns them ranked by Upcharge
  // ascending, baseline implicitly 0%.
  function compare(baselineMenu, channels, threshold) {
    var results = channels.map(function (ch) {
      var matches = matchMenus(baselineMenu, ch.menu, threshold);
      var summary = summarizeUpcharge(matches);
      // a few highest-confidence matches as user-facing evidence
      var evidence = matches
        .slice()
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 4)
        .map(function (m) {
          return { name: m.name, baselinePrice: m.baselinePrice, targetPrice: m.targetPrice };
        });
      return { key: ch.key, summary: summary, evidence: evidence, matchCount: matches.length };
    });
    results.sort(function (a, b) {
      var am = a.summary.medianPct, bm = b.summary.medianPct;
      if (am == null) return 1;
      if (bm == null) return -1;
      return am - bm;
    });
    return results;
  }

  // Rank gathered Channels against the cheapest of them (ADR-0013). Direct is
  // not required — if one is present and cheapest it becomes the Baseline, but
  // otherwise the cheapest readable Channel is the Baseline.
  //   channels: [{ key, isDirect?, backend?, menu: [{name,price}] }]
  //   → { baselineKey, baselineIsDirect, ranked: [{ key, isDirect, backend,
  //        isBaseline, solo?, summary }] }  (ranked ascending by Upcharge)
  function soloResult(c) {
    return {
      baselineKey: c.key, baselineIsDirect: !!c.isDirect,
      ranked: [{ key: c.key, isDirect: !!c.isDirect, backend: c.backend, isBaseline: true, solo: true, tied: true,
        summary: { n: 0, medianPct: 0, lowPct: 0, highPct: 0, consistent: true } }]
    };
  }

  function rankByCheapest(channels) {
    var usable = (channels || []).filter(function (c) { return c.menu && c.menu.length; });
    if (usable.length === 0) return { baselineKey: null, baselineIsDirect: false, ranked: [] };
    if (usable.length === 1) return soloResult(usable[0]);

    // Pass 1 — relative price level vs a good-names reference (prefer a Direct,
    // else the largest menu, for the most reliable matching).
    var ref = usable.slice().sort(function (a, b) {
      return ((b.isDirect ? 1 : 0) - (a.isDirect ? 1 : 0)) || (b.menu.length - a.menu.length);
    })[0];
    var level = {};
    usable.forEach(function (c) {
      if (c.key === ref.key) { level[c.key] = 1; return; }
      var s = summarizeUpcharge(matchMenus(ref.menu, c.menu));
      level[c.key] = s.medianPct == null ? null : (1 + s.medianPct / 100);
    });
    var leveled = usable.filter(function (c) { return level[c.key] != null; });
    if (leveled.length < 2) return soloResult(ref); // nothing matched the reference

    // Pass 2 — express each Channel's Upcharge against the actual cheapest.
    var cheapest = leveled.slice().sort(function (a, b) { return level[a.key] - level[b.key]; })[0];
    var ranked = leveled.map(function (c) {
      if (c.key === cheapest.key) {
        return { key: c.key, isDirect: !!c.isDirect, backend: c.backend, isBaseline: true,
          summary: { n: c.menu.length, medianPct: 0, lowPct: 0, highPct: 0, consistent: true } };
      }
      return { key: c.key, isDirect: !!c.isDirect, backend: c.backend, isBaseline: false,
        summary: summarizeUpcharge(matchMenus(cheapest.menu, c.menu)) };
    }).sort(function (a, b) { return (a.summary.medianPct || 0) - (b.summary.medianPct || 0); });

    // Channels effectively the same price as the cheapest are tied, not pricier.
    ranked.forEach(function (r) {
      r.tied = r.summary.medianPct != null && Math.abs(r.summary.medianPct) <= TIE_PCT;
    });

    return { baselineKey: cheapest.key, baselineIsDirect: !!cheapest.isDirect, ranked: ranked };
  }

  global.CheapBiteCompare = {
    normalizeName: normalizeName,
    diceCoefficient: diceCoefficient,
    similarity: similarity,
    matchMenus: matchMenus,
    summarizeUpcharge: summarizeUpcharge,
    compare: compare,
    rankByCheapest: rankByCheapest
  };
})(typeof window !== "undefined" ? window : this);
