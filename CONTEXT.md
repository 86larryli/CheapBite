# CheapBite

The domain glossary for a tool that, given a restaurant the user already wants to order from, finds the cheapest way to get the **specific items** they want. This file is a glossary only — no implementation details.

## Language

**Basket**:
A specific set of menu items the user has decided to order from one restaurant, before any purchase is committed. The unit of price comparison — we compare what the *same Basket* costs across channels, never restaurants in the abstract.
_Avoid_: Cart (a platform's UI term), Order (implies a committed purchase), Meal

**Channel**:
A distinct way to obtain a Basket, identified by a Provider plus a Fulfillment mode (e.g. "Uber Eats pickup"). The atom that gets priced and ranked. In the MVP, Fulfillment is fixed to Pickup, so a Channel is effectively one Provider's pickup price.
_Avoid_: Option, route

**Provider**:
A branded ordering service through which a Basket can be obtained — Uber Eats, DoorDash, Grubhub, Toast, or Direct. For a given restaurant, the set of Providers is **whatever Google Maps lists** for it, not a list we curate.
_Avoid_: Platform (overloaded), app, service

**Provider Family**:
A set of Providers owned by one company on a shared pricing backend, treated as interchangeable for comparison — e.g. Uber {Uber Eats, Postmates}, DoorDash {DoorDash, Caviar}, Grubhub {Grubhub, Seamless}. Only the canonical Provider of each Family is Gathered; Direct is never grouped into a Family.
_Avoid_: Group, parent company, brand

**Fulfillment**:
How the Basket reaches the user — **Pickup** or **Delivery**. The user chooses it up front; it is an input/filter, not something we optimize across (a pickup price and a delivery price are never ranked against each other). MVP supports Pickup only.
_Avoid_: Delivery method, mode

**Direct**:
The Provider representing the restaurant's own ordering site, whichever Ordering Backend powers it. Usually the cheapest Channel and the core reason CheapBite exists. Discovered either from Google Maps' pickup list or by following the restaurant's "Website" link and detecting its Ordering Backend.
_Avoid_: Own website, first-party, the restaurant's site

**Adapter**:
A per-Backend / per-Provider menu reader exposing `readMenu(root) → [{name, price}]` (plus `backend` and `matches(url)`). Each Channel is read by exactly one Adapter; adding support for a Provider means adding an Adapter, not changing the core. The unit of work and of fragility.
_Avoid_: Scraper, parser, plugin

**Gather**:
The act of opening a Channel (a background tab) and running its Adapter to read the menu into items, returning a status envelope (`ok` / `empty` / `timeout` / `blocked`) so a Channel that can't be read is flagged, never guessed.
_Avoid_: Scrape, fetch, crawl

**Ordering Backend**:
The third-party ordering technology that runs a Direct channel — Toast, Square, ChowNow, Olo, and similar. Distinct from the user-facing Direct Provider: one Direct channel is powered by exactly one backend, and which one it is determines how its prices can be read.
_Avoid_: POS, platform

**Anchor Channel**:
The single Channel whose menu the user browses to assemble the Basket; the Basket's items are *defined* by the Anchor. Defaults to Direct, the menu the restaurant actually maintains.
_Avoid_: Source menu, base channel, primary

**Match**:
The link between a Basket item (defined on the Anchor Channel) and the corresponding item on another Channel, carrying a confidence. A low-confidence Match is surfaced for the user to confirm; an uncertain Match is never silently assumed. A Channel with no acceptable Match for some Basket item cannot fulfill the exact Basket, and is flagged rather than priced with a guess.
_Avoid_: Mapping, pairing, alignment

**Quote**:
The comparable cost CheapBite assigns to a Channel for a given Basket, and the number Channels are ranked by — pre-discount, taxes and pickup fees excluded and disclosed as such. (Phase 1 ranks by **Upcharge** from a **Sample** instead; the exact per-Basket Quote is the later precision upgrade — see ADR-0009.)
_Avoid_: Price (ambiguous — could mean a single item's price), total

**Upcharge**:
How much higher a Channel's prices run versus the **Baseline**, as a percentage (e.g. "Uber Eats ≈ +18%"). Estimated in Phase 1 from a Sample — the median of per-item price ratios — and shown as a range, since markups aren't perfectly uniform across items. The headline comparison number. Channels within ~0.5% of the cheapest are shown as **tied** ("same price") rather than "+0.0% more".
_Avoid_: Markup (restaurant-side term), surcharge, fee

**Sample**:
The set of confidently cross-platform-matched menu items CheapBite uses to estimate Upcharge — in practice all high-confidence Matches between a Channel and the Baseline (often dozens), not the user's actual order. A few are surfaced as evidence. (See ADR-0009; supersedes the earlier "pick 3–5" framing.)
_Avoid_: Basket (the user's real chosen items), selection

**Baseline**:
The Channel that Upcharge is measured against — the Direct channel, or the cheapest available Channel if there is no Direct. Its Upcharge is 0% by definition.
_Avoid_: Reference; Anchor (which means the menu a Basket is built on, in the precision phase)
