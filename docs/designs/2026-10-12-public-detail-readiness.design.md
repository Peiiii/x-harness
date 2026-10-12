# Public detail navigation readiness

Contract: x-public-detail-readiness-20261012. Flow bugfix, behavior risk L2,
publication/adoption L4. Scope is read-only navigation; no ledger, submission,
recovery identity, body, author, time, source, media or ALT gate changes.

## Observable failure and design

A cold detail navigation can have committed its exact URL while document load
has not completed. The existing URL wait defaults to load and fails before the
fresh target observation. A second read already at that URL succeeds. Separately,
a first visible article may belong to a stale timeline rather than the permalink.

For post navigation only, wait up to 15 seconds for the exact observed URL at
commit, then up to 15 seconds for an article containing that exact permalink.
This is a condition wait, not a fixed sleep. No reload, second submission or
repeated direct navigation is added. Non-detail source lists wait for their first
article. Existing inert visible-link fallback still requires unchanged route and
an alert-free observation; a direct route timeout or interruption still fails.
Full fresh observation and public verification remain authoritative after waiting.

## Acceptance and review

PD-1: synthetic cold route requires commit, then the exact permalink article;
passed. PD-2: URL timeout, interrupted connection and missing article preserve
failure with one navigation and no write; passed. PD-3: existing inert-link and
profile paths, source type/build/format/maintainability and 144 tests; passed.
PD-4: managed npm artifact identity and consumer validation; required at delivery.
PD-5: live cold detail read; required at adoption, host availability may block it.

Design review: no findings. Conditions bind to the original public target; the
bounded wait changes readiness, never acceptance. The original strict recovery
checks are unchanged. Implementation review: no findings after reviewing the
navigation diff and positive/negative tests. No additional page data is exposed.

Retrospective: document load and public article readiness are distinct conditions.
Use URL commit plus target content, not a longer fixed delay or another write.
