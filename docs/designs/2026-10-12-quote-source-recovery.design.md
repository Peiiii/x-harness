# Exact quote source recovery

Flow: bugfix. Risk: L3 (publication acceptance). Retrospective: completed; increment is this explicit source-binding contract and negative regression coverage.

An X source URL at the end of reviewed content may become a quote card without an anchor href. The existing verifier cannot prove that the card belongs to the reviewed source. Keep body, author, absolute time, baseline and media gates unchanged.

Required acceptance: follow exactly one observed visible card in the target article; observe its actual destination; match source author, absolute time and full body against the card; return to the parent and require its fresh card to match; compare the actual source ID and URL with the reviewed trailing URL. Missing, ambiguous, changed or inaccessible evidence cannot verify. Navigation only; no composer, writes or resubmission.

Root read API exposes `resolveQuote: true` and compact `quoteSource`. Verification uses the same platform path, preserving lock/CAS settlement. DOM capability preflight checks navigation and unique semantic control methods. Native callers without this capability remain unconfirmed.

Design review: passed. Reuse existing article boundary, browser navigation, read/ready and original verifier/store. No expected source ID is used to construct a navigation destination. Actual card body/time binding defeats wrong-ID or same-author substitutions.

Implementation review: passed after capability gate and result projection corrections. Synthetic tests cover source body/author/time mismatch, altered parent binding, wrong source ID, wrong public body/author/time, and incomplete evidence. Existing canonical-body tests protect quote exclusion and invisible protocol handling. Actual browser evidence stays solely in the consuming private repository.
