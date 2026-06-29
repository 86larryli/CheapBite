# Build the Basket on an Anchor Channel; match with confidence, never fake a price

> **Status (2026-06-27):** The exact-Basket flow described here is deferred to a later *precision* phase. Phase 1 instead ranks Channels by a sampled **Upcharge** estimate (see ADR-0009). The matching principles below — confidence, human-in-the-loop, never fake a price — still apply, to the sampled items.

The user assembles the Basket by browsing one Channel's real menu — the **Anchor Channel**, defaulting to **Direct** (the menu the restaurant actually maintains). CheapBite then auto-matches each Basket item onto the other Channels, attaching a confidence to each **Match**. We deliberately reject building a single canonical/unified menu (too costly to build and keep accurate) in favor of this anchor-and-match approach.

Two rules protect trust — the product's only real asset:

- **Never silently assert an uncertain Match.** Low-confidence Matches are surfaced for the user to confirm or correct; only high-confidence Matches pass automatically.
- **Never fabricate a price.** If a Channel has no acceptable Match for some Basket item, it is flagged "can't match your exact Basket" and dropped from (or shown as partial in) the ranking — never filled with a guess.

Rationale: a single wrong Match makes the tool lie, which destroys user trust. Admitting uncertainty is cheaper than being confidently wrong.
