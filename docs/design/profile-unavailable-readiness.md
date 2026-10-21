# Profile unavailable readiness

Flow: bugfix, L2, retrospective completed

The profile readiness owner retries UserName on a fully rendered unavailable profile, wasting navigation/read time before returning a safe failure

Design: within DOMNavigation profile readiness, reject a visible primary-column empty-state header only when UserName is not visible, then freshly verify the exact route and absence of alerts. Check before waiting and after a readiness timeout, before the existing one reload. Return profile-content-unavailable, never a relationship or success. Ordinary loading, transport failures, identity checks, refresh persistence and existing retry bounds remain unchanged. A normal profile name wins over an empty timeline marker. Unsupported visibility observation retains the existing fail-closed wait path

Acceptance: unavailable open/refresh returns explicit failure without the repeated waits/reload, normal profile and normal empty timeline remain readable, route/alerts retain rejection, ordinary loading retains bounded recovery. Synthetic tests must fail before the fix; live read must use the original unavailable target without any write intent

Design review: passed — scope is the existing private readiness owner, no API/schema change or automatic skip, no text-based frozen inference, no new write or retry. Prefer this minimal observed-signal check to a union selector that changes every readiness wait and fixture

Validation and implementation review: passed, no findings. Eight of14 new cases failed before repair;42 directed/705 full tests pass after repair, types/contracts/build/format/maintainability pass. Consumer original unavailable root read returned explicit profile-content-unavailable in12.7s versus prior25.2s; normal original profile read remained fresh/complete. Single samples include navigation/observation and do not prove sustained latency or follow capacity. Private receipts stay with consumer.

Delivery: validated local build adopted by the original consumer; source-only delivery, package version unchanged. No manual product acceptance is required for this private diagnostic behavior; unavailable remains a safe decision, never success or an intent.

Retrospective decision: the observed unavailable-signal regression belongs in the existing readiness tests, implemented here. No new global rule or retry policy. Ordinary profile-without-name loading remains separately unconfirmed and is not claimed fixed.
