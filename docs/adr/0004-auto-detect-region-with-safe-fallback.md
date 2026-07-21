# Auto-detect region with a safe fallback

**Status: accepted**

The collector identifies US, EU, or Asia from the active game-server connection when the mapping is known. If the server cannot be mapped reliably, the collector must not guess or persist an unlabelled order; it instead asks the user for a manual region selection. This avoids silently mixing regional markets while keeping normal sessions hands-free.
