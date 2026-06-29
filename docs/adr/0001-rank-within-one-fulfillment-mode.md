# Rank Channels within a single Fulfillment mode

CheapBite compares the cost of one user-chosen **Basket** (a known set of menu items) across **Channels** (Provider × Fulfillment). **Fulfillment is a user-chosen input, not an optimization target**: we only ever rank Channels *within* the same mode — a Pickup price is never ranked against a Delivery price, because they are different goods (they differ in the user's time, effort, and gas, not only in money). Optimizing "cheapest" across modes would mislead, since it would tell a user who wants delivery that pickup is cheaper.

The MVP supports **Pickup only**; Delivery is deferred because its fees (delivery fee, service fee, small-order fee) make the total materially harder to compute.
