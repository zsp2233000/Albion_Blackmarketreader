# Integrate the collector with the existing local server

**Status: accepted**

The passive collector, local JSON state, and React Dashboard are integrated through the existing .NET local server at `localhost:5173`. The local server is the realtime entry point, while Vercel continues to serve only the manually published deployment snapshot. This avoids introducing a second local application entry point.
