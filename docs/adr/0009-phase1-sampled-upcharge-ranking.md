# Phase 1 ranks Channels by a sampled Upcharge estimate, not an exact Basket

For Phase 1, CheapBite does **not** ask the user to build their exact Basket (deferring ADR-0003). Instead it auto-samples a few distinctive main items, matches them across the discovered Channels, and reports each Channel's **Upcharge** — how much higher its prices run versus a **Baseline** (the Direct channel, or the cheapest Channel if there's no Direct) — e.g. "Uber Eats ≈ +18% vs ordering direct."

**Why.** The user's actual decision is a *ranking* ("which Channel?"), which a sample serves. Restaurants price a Channel as a consistent *level*, so the ranking is basket-independent even though the exact savings are not. Sampling removes the two hardest pieces from Phase 1's critical path — cart-building UX and arbitrary cross-platform matching — while still exercising the core pipeline (read each menu → match → compare). Because *we* choose the items, we pick the most matchable mains, making matching far easier.

**Method.**
- **Match the full menus** (the Adapters already read them) and keep only high-confidence matches; compute `Upcharge = median over ALL matched items of (item price / baseline price) − 1`. *(Refinement, 2026-06-27: the original "pick 3–5 items" was for when matching arbitrary items was costly; with full menus in hand, a median over all confident matches — often dozens — is strictly more robust and the median still absorbs the odd flat-priced item. A few matches are surfaced as user-facing evidence.)*
- Show the Upcharge as a **range** (IQR, p25–p75); rank ascending (Baseline = 0%).
- **Consistency guard:** if the matched items disagree on direction (a meaningful share point the opposite way to the median), flag uncertainty rather than assert a winner — the rare case where ranking-invariance fails.

**Empirical validation (Pho Element, Clover Direct → DoorDash).** 72 items matched; median upcharge **+15.3%**, IQR **14.8–15.6%**, with **all 72 items pricier on DoorDash** (none cheaper). The near-flat IQR and unanimous direction strongly support the ranking-invariance assumption for this restaurant.

**Trade-off accepted.** The percentage is an *estimate*: markups aren't perfectly uniform across items (psychological rounding, flat-priced drinks), so it's shown as a range, not a promise. The exact-Basket flow of ADR-0003 remains the eventual **precision upgrade** for users who want their literal order total. The matching *principles* of ADR-0003 (confidence, never fake a price) still apply — to the sampled items instead of a user Basket.
