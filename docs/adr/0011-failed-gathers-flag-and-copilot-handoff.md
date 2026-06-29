# Failed gathers are flagged, never dropped; recoverable walls trigger a co-pilot handoff

A Gather (ADR-0010) of an aggregator often doesn't cleanly succeed: a sign-in or set-location **wall**, a CAPTCHA/Cloudflare **block**, a **timeout**, or an **empty** read (selector drift / no pickup menu). This is common enough to be core behavior, not an edge case. Building on ADR-0003 (never fake a price) and ADR-0009 (drop-and-flag):

- **Never silently drop, never guess.** A Channel we couldn't read is **shown in the result, explicitly flagged with the reason** ("Uber Eats — couldn't read prices: sign-in required"). Silent omission would read as "this Channel doesn't exist."
- **Rank only `ok` Channels;** flagged ones are listed separately as "not compared" and feed ADR-0009's consistency guard.
- **Co-pilot handoff for recoverable walls.** Because the Gather runs in the user's *real* browser, on a wall/block we **surface that background tab to the user** — "sign in / set your address, then click Retry." This is the co-pilot fallback reserved in ADR-0006, and it turns the most common failure into a one-click fix. It means the orchestration can pause, hand off a tab, and resume.
- **Timeout/empty** get one automatic retry, then a flag (no handoff — nothing for the user to do).
- **If the Baseline itself fails** (Direct unreadable), apply ADR-0009's fallback — cheapest `ok` Channel becomes Baseline — and note "Direct unavailable — savings shown vs cheapest readable channel."

**Reason detection is an optional, per-Adapter capability.** The generic runner only distinguishes `timeout`/`empty`; classifying `blocked` vs `login` requires platform-specific signals (a login modal, a CAPTCHA iframe), so Adapters refine the reason as we learn each platform rather than it being required up front.
