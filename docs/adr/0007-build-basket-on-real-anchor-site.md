# Build the Basket on the real anchor site; read the cart back; match conservatively

The user assembles the Basket in the **native UI of the real anchor site** (the Direct site by default), and the extension reads the finished cart. We deliberately do **not** build our own menu/basket-builder overlay.

Rationale: real menus are modifier *trees* (sizes, required option groups, paid add-ons), modeled differently by every Ordering Backend. Reproducing them faithfully would mean building a **universal menu renderer** — the single largest and most fragile piece of work in the project. Delegating to each platform's own UI eliminates that entirely, and the user's actual cart is the most trustworthy possible definition of the Basket.

Consequence for matching (extends ADR-0003): matching is done at the item level; any modifier configuration we cannot confidently align across Channels is **flagged as unverified rather than guessed**. If reading a particular site's cart proves impractical, we fall back to a simple-items-only scope for that backend.
