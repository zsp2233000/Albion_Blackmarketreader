# Use JSON as local order state and publishing projection

**Status: accepted**

The collector uses JSON as the persistent current Black Market order state and as the existing website's manually published snapshot format. Each update must be written safely (temporary file followed by an atomic replacement) so a process interruption does not leave a partially written document. This keeps the single-user local workflow simple and makes manual GitHub publishing direct, while accepting that JSON is not intended for unbounded history or complex querying.
