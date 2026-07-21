# Use a conservative valid-order rule

**Status: accepted**

Only Black Market orders with a positive amount, positive unit price, parseable future expiry, and capture age within one hour participate in the headline price calculation. Orders that fail validity checks are retained for traceability but excluded from pricing, preventing stale or malformed packets from producing false opportunities.
