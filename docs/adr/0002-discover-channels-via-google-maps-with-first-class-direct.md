# Discover Channels via Google Maps, with Direct as first-class

The set of Providers to compare for a restaurant is **derived from what Google Maps lists** for it, rather than from a platform list we curate — so coverage tracks Google automatically and we don't maintain a per-restaurant mapping.

The one deliberate exception is the **Direct** channel (the restaurant's own ordering site), which we treat as first-class **even when Google omits it from its pickup list**. Google frequently surfaces Direct only behind a restaurant's separate "Website" link, not in the "Order online" list. So when Direct isn't listed, we follow the Website link and detect a known **Ordering Backend** (Toast / Square / ChowNow / Olo, which cover most independents).

Rationale: Direct is usually the cheapest channel and the core reason CheapBite exists; excluding it would let the tool show a "cheapest" that isn't. Accepted cost: Direct is the messiest scraping surface (every site differs), and we will not chase bespoke backends in the MVP.
