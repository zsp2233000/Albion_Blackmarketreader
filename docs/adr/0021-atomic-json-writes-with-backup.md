# Write JSON atomically with a last-known-good backup

**Status: accepted**

Local state writes go to a temporary file, are validated as readable JSON, and then replace the active file atomically. The previous valid file is retained as a `.bak`. On startup, a corrupt active file falls back to the backup; if both are unreadable, the application uses the Albion Data API fallback. This gives the JSON-only store basic crash recovery without introducing a database.
