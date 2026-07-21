# Fail closed on unknown or mismatched region

**Status: accepted**

The collector auto-detects US, EU, or Asia when the active game server is known. If detection is unknown, an explicit manual region is required. If an explicit region conflicts with the detected region, the publish operation stops without writing. This prevents captured data from being overlaid onto the wrong regional snapshot.
