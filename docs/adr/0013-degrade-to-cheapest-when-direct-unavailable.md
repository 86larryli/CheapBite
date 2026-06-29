# Degrade gracefully: rank gathered Channels vs the cheapest; Direct is preferred, not required

CheapBite must not hard-fail when a restaurant's Direct (own-site) backend is one we don't have an Adapter for yet, or when the Direct gather times out. That case is **common** — the universe of Direct backends (Toast, Square, ChowNow, Clover, Olo, bespoke…) is large and our Adapter list is small.

So instead of requiring a readable Direct as the Baseline (and erroring out otherwise), the extension:

- **Gathers every Channel it has an Adapter for** — all Direct candidates with adapters *plus* one canonical aggregator per Provider Family. No privileged baseline is chosen up front.
- **Ranks whatever succeeds against the cheapest of them.** The cheapest readable Channel becomes the Baseline (0%); everything else is shown as its Upcharge vs that cheapest. (This is exactly the fallback ADR-0009 already specified — "the Direct channel, *or the cheapest Channel if there's no Direct*" — which the first implementation didn't honor.)
- **Surfaces, but doesn't block on, the gaps.** A Direct backend with no Adapter is still listed ("adapter coming"), and a Channel that failed to read is flagged — but neither stops the comparison among the Channels we *could* read.
- Only shows a no-comparison message when **zero** Channels were readable.

Labeling preserves the strong message in the common case: when the cheapest readable Channel **is** a Direct, it's labeled "Order direct (<backend>)" and others read "X% more than direct"; otherwise the baseline is "<Channel> (cheapest)" and others read "X% more than the cheapest".

Mechanism (`compare.js` `rankByCheapest`): match all Channels against a good-names reference (prefer a Direct, else the largest menu) to get each one's relative price level, pick the lowest as the cheapest, then re-match against the cheapest so every Upcharge is expressed against the true Baseline.
