# Fall back safely when packet parsing fails

**Status: accepted**

The collector skips packets that cannot be parsed completely and never persists uncertain order data. The affected item continues to use the Albion Data API fallback. The local status reports the last successful capture and parse-error count; raw packets are not retained unless an explicit debug mode is enabled. This prevents malformed or protocol-version-changed data from affecting prices.
