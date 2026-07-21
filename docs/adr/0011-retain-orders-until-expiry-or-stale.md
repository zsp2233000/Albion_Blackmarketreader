# Retain unseen orders until expiry or staleness

**Status: accepted**

When an order is absent from a later captured response, the collector keeps its last known state instead of deleting it immediately. The order is excluded from calculations once its server-provided expiry has passed or its last observation is older than one hour; storage cleanup can happen afterward. This prevents switching the player's market query from falsely removing still-valid orders.
