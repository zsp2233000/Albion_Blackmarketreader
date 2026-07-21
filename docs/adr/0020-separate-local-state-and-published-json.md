# Separate local state JSON from published projection JSON

**Status: accepted**

The collector stores complete current Black Market order state in a local-only JSON file. The existing `bm-crafter-{region}.json` files remain the tracked Git/Vercel publication projection. The local state is the collector's source of truth; the tracked files contain only the website-facing projection. This prevents detailed local capture state from being published accidentally and keeps the existing deployment format stable.
