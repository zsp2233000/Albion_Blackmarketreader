# 01 — Fix false EU detection during Asia capture

**What to build:** When a user browses Black Market listings on the Asia server, local packet capture remains active and successfully parses the market orders instead of stopping because an endpoint is incorrectly classified as EU.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Explicit Asia capture can continue and parse valid Asia Black Market orders.
- [ ] Capture does not stop because of a false EU classification caused by stale or inaccurate endpoint-region data.
- [ ] Genuine cross-region traffic still has an explicit safety response.
- [ ] A regression test proves that valid Asia traffic is not rejected as EU.
- [ ] Capture status clearly reports the active region and successfully parsed order count.
