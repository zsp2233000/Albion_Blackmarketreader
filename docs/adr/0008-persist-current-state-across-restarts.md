# Persist current state across collector restarts

**Status: accepted**

The collector persists its current Black Market order state and reloads it after a restart. Reloaded rows remain eligible only while their capture age is within one hour; older rows may remain stored for inspection but cannot influence the current price. This prevents a collector or game restart from discarding otherwise usable observations.
