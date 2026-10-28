# Evidenced post navigation without parsing the previous page

Contract PN-20261028; bugfix, L3; parent goal: reduce unnecessary host calls in sequential evidenced post reads without weakening fresh target proof. This is necessary active-consumer repair; no separate npm release. Existing account-route reuse is the owner, not a new cache or transport.

Observed violation: after one successful post read, the next evidenced permalink reparses the previous page before navigation. Independent live pure DOM probes each took about 30s. This redundant read does not supply target content; current non-thread opening does not use its alerts as a stop. Managed transport latency itself is unproven and is not changed or bypassed.

Freeze: extend existing trusted actor-route navigation reuse only for exact post URL/targetId pairs without threadRootId. The existing adapter checks the actual route before navigation, then ready/observed must freshly read the exact destination and propagate its alerts, missing identity and content. Never return cached content, never reuse for current-target reads, invalid/failed cache or root-thread membership. No request-header, policy, provider or timeout changes.

Golden chain: two independently evidenced post reads on one binding -> first learns trusted route -> second navigates original target without parsing previous body -> fresh destination proof -> original consumer ingest/settlement. Mid-navigation failure remains failure, no synthetic success. External page changes cannot substitute cached content; adapter actual-route gate and final fresh read remain.

| Required ID | Acceptance fixed before implementation | State |
| --- | --- | --- |
| PN1 | Second exact non-thread post needs one destination observe, not two; initial/no-cache and same-target reads remain fresh | passed |
| PN2 | Destination alerts/missing identity, navigation error, invalid cache, target mismatch and thread guard cannot return cached success | passed |
| PN3 | Types, targeted regressions, full tests, diff maintainability and implementation review pass | passed |
| PN4 | Real original pending read is settled from actual proof; sequential permitted read adopts built artifact with usage evidence | not-run |

Design review: passed, same existing owner/cache, narrower evidenced target predicate, no new state/config, no cached content or prior alert bypass for thread reads. Synthetic call count proves eliminated request independently of variable network. Live timings remain separate; no claim of fixing the provider's recurring 30s latency. Other business actors keep their valid bindings until a safe boundary.


## Same-owner design correction after live validation

PN1–PN3 passed: one fewer previous-page observe and1066 tests, but a live read still took90s (navigation60s + destination30s), so no elapsed-speed claim. Actual `tab.url()` took4ms. DOMNavigation waited for URL unconditionally on posts after goto even with an exact current URL; composer already reuses this evidence. Extend that exact-route reuse to posts, retaining the strict exact-permalink article readiness and final fresh destination observation. Missing url capability or actual different URL still waits; wait/goto errors do not fabricate readiness. No provider policy/header changes.

Required PN5: exact committed URL avoids redundant waitForURL, while missing/different route, goto error, alert and article readiness tests preserve refusal. New review: passed, reuses original route gate, no new cache/variant/state. Live navigation timings and same-condition call counts remain separate. Sampling consumer now accepts bounded1–5 chunks (default5) so one slow read can return without losing the batch kernel; untouched next targets remain unclaimed, no new quota/scheduler. Performance overall remains open until real adoption evidence.

Implementation review: no findings. Exact target/route guard and same-page fresh read remain; destination alert, missing identity, thread alert, invalid cache, navigation failure and genuine URL uncertainty are covered.1067 full tests,48 affected navigation/read cases, types/build, formatting and maintainability pass. PN4 and actual PN5 adoption remain pending next natural sample; test call reduction does not prove transport repair.
