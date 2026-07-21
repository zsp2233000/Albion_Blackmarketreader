# Add per-entry source and observed time metadata

**Status: accepted**

Each published market item may include `source` (`local` or `api`) and `observedAt`, while the existing `id`, `bm`, and `sold` fields remain unchanged. The UI can filter entries by source and show the observation time. Legacy entries without metadata default to API and use the file-level `generatedAt` when available. This supports mixed local/API fallback without breaking the current numeric data shape.
