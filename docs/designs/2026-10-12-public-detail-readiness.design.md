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

Delivery: 0.2.23 was published with source revision 1ae20f4, passed four release
checks, artifact identity and all 188 consumer checks. PD-4 passed. PD-5 passed
on an agent-owned cold Chrome tab: one root read navigated to the formerly failing
detail and returned complete fresh body, author, absolute time, ID and media state.
No submission or ledger settlement was used. This is a measured sample, not a
claim that every public route is available. A separate quoted-post route exposed
no article after bounded waiting and stayed unconfirmed; no source ID was inferred.

## Regression: host-capped waits

The first delivery did not cover hosts that return URL timeout despite the exact
committed route, or cap each locator wait below timeoutMs. Increasing a per-call
number was insufficient. The root API has no Promise.race/deadline override in
this chain. CUA uses timeoutMs, not standard Playwright's timeout; tests now assert
that signature and simulate elapsed time without real sleep.

Revision PD-R1: on URL timeout only, fresh account observation must show the exact
target route without alerts before proceeding to content. Changed route,
interruption or warnings still fail. No additional direct navigation is added.
PD-R2: exact-article waits use up to 5-second condition waits inside one 15-second
absolute deadline and at most four host calls. A host timeout can resume only
after fresh unchanged route and no alerts; interruption is never resumed. A stale
article still cannot satisfy the exact permalink locator. Timeout remains failure.

PD-R1/R2 signature, elapsed deadline, late arrival, wrong route, alert,
interruption and no-renavigation regressions pass. Full checks pass 152 tests.
Implementation and design review: no findings. Real original failed detail was
complete in one dev root read after cold navigation; formal package adoption
remains required. No writes or account settlement occur in this validation.
