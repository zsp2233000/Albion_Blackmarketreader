# Retain quality internally and keep the published schema flat

**Status: accepted**

The local JSON keeps quality and complete order details, but the published Black Market projection keeps the existing `{ id, bm, sold }` item format. For `bm`, only Normal, Good, and Outstanding orders are eligible and the highest valid buy-order unit price is used. `sold` remains sourced from the existing API history. This avoids changing the current frontend data contract while preserving richer local capture data.
