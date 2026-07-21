# Keep the online reader on deployed data

**Status: accepted**

The online Vercel reader continues to load static data from the deployment built from GitHub, rather than fetching a live external data source at runtime. The local collector is the only source with the five-second freshness target; a snapshot reaches GitHub only through an explicit manual publish and may trigger a Vercel deployment. This keeps the existing deployment model simple and avoids introducing a new public data endpoint, at the cost of accepting push, build, and cache latency for the online view.
