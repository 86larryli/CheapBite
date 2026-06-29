# Gather one representative per ownership family, plus every Direct

A restaurant often lists many aggregator Providers that are the same company on the same backend, so gathering all of them (ADR-0010) is redundant, slow, and more detectable. We **dedupe Channels by ownership family** and Gather only the canonical representative of each, plus *every* Direct channel.

Families (as of 2026):
- **Uber** — Uber Eats *(canonical)*, Postmates
- **DoorDash** — DoorDash *(canonical)*, Caviar, order.online (Storefront → also a Direct)
- **Grubhub** — Grubhub *(canonical)*, Seamless
- **Independents** — e.g. Fantuan (own family)
- **Direct** — never deduped; all are gathered (they are the point of the tool)

Empirical corroboration from the captured Pho Element data: sibling pairs showed identical "ready" times (Uber Eats & Postmates "1–16 min", Grubhub & Seamless "20 min", DoorDash & Caviar "7 min") — consistent with one store on one pricing backend. This cuts ~9 listed Channels to ~4 Gathers with negligible loss.

**Trade-off.** Siblings usually share pricing but aren't guaranteed to (a restaurant *could* configure them separately). We treat sibling-equals-price as an assumption **verified once** (spot-check a couple of restaurants) then trusted; if a sibling ever diverges, ADR-0009's consistency guard catches it. The Provider→Family map is data we maintain (new brands/acquisitions change it), not logic.
