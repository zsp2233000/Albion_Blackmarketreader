# Use manual refresh for the local Dashboard

**Status: accepted**

The local Dashboard does not poll or receive automatic realtime updates. The collector continues writing local JSON, and the user refreshes the browser when they want to view the latest state. This keeps the local UI simple and avoids unnecessary background requests while preserving realtime capture at the data layer.

A browser refresh only reloads the local data and the existing API-backed snapshot; it does not invoke the separate API refresh pipeline.
