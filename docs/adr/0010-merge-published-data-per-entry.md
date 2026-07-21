# Merge published data per item entry

**Status: accepted**

Manual publication replaces an existing Black Market entry only when the local JSON contains valid captured data for that item, region, and location within the one-hour freshness window. Entries without usable local data remain backed by the existing Albion Data API snapshot. This preserves the established fallback behavior while allowing captured entries to publish fresher values.
