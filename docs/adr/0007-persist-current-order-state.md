# Persist current order state, not an unbounded event history

**Status: accepted**

The collector persists the latest known state for each Black Market order and updates it when the same order is observed again. It does not retain an unbounded order-observation history in the first version; historical sales statistics remain the responsibility of the existing API path. This keeps the local store compact and optimized for current-price lookup.
