# Publish a local overlay without refreshing the API

**Status: accepted**

The manual publish operation uses the currently checked-in `bm-crafter-{region}.json` as its fallback base, overlays only local entries that are valid and at most one hour old, and writes the existing flat format. It does not call the API, commit, or push automatically. This keeps publishing predictable and ensures that an uncaptured entry retains the existing deployed snapshot.
