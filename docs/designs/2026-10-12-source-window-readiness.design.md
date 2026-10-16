# Asynchronous source-window readiness

Contract: x-source-window-20261012. Flow: bugfix. Implementation risk: L2;
publication/adoption: L4. Parent outcome remains the consumer's original task.

## Evidence and scope

A retained DOM prefix is already visible when pagination requests the next
offset. The existing readiness check only waits when every article is absent;
the next empty offset is therefore declared unrendered before delayed cards can
appear. A synthetic collection/observation integration reproduces this failure.
The initial adapter wait also selects the first article instead of the requested
slot. This does not prove that every incomplete live window contains more rows.

The source reader will expose the first rendered primary post ID as internal
metadata. Readiness will make one existing bounded DOM wait for an absent offset
while a prefix is present. The adapter targets that article index. Collection
will reset its offset if virtualization replaces the prefix during the wait.
No refresh, additional navigation, network request, new write, or larger page
budget is introduced. Alerts stop recovery; a timeout remains incomplete.
Native results without DOM metadata and the initial first-article wait retain
their existing behavior. Public root task arguments/results remain unchanged.

## Golden acceptance paths

1. Processed prefix -> scroll -> delayed next card -> one slot wait -> complete,
   unique source -> the consumer reviews/prepares it through its original API.
2. Prefix replaced during loading -> slot wait/timeout -> observe changed first
   ID -> restart at the new prefix -> no new cards silently skipped.
3. Actual alert or no new cards -> no repeated wait/refresh -> incomplete result
   and original task recovery policy. No platform success is inferred.

## Required acceptance

| ID | Proof | Initial status |
| --- | --- | --- |
| SW-1 | Delayed prefix and asynchronous virtualization integration regressions | passed |
| SW-2 | Alert, timeout, default wait and invalid offset regressions | passed |
| SW-3 | Source type/build/tests, diff-only maintainability and implementation review | passed |
| SW-4 | Reviewed npm artifact identity, consumer validation and necessary live source read | passed |

Plan: not required; one bounded fix/release batch. Design review: the metadata is
limited to the actual first primary ID; the wait is read-only and bounded; offset
reset is performed only after a fresh changed-prefix observation. It adds no
parallel state or generalized paging framework. Live coverage/latency and
platform availability remain to be measured after adoption. Source tests and
this document contain synthetic data only.

Implementation review: no findings in the changed window/readiness boundary.
The full source check passes 133 tests, types, generated-observation consistency
and maintainability. Native metadata absence, timeout, alert and asynchronous
prefix replacement are covered. Publication/live adoption remains SW-4 pending.
Safe delivery additionally requires the consumer manager to serialize its install
across different producer checkouts while retaining producer-level PID locking;
its isolated subprocess regressions cover live ownership, dead ownership cleanup
and two producers sharing one consumer. No SDK write policy changes.

Delivery acceptance: version 0.2.20 passed artifact identity and 188 consumer
checks and was adopted through the managed release. The original root source
API then returned complete Chinese sources and the consumer prepared reviewed
candidates with no write. This verifies live adoption, not universal pagination
coverage or platform availability; a later incomplete window remained incomplete
and required the existing bounded recovery policy.

Retrospective decision: update the existing readiness owners and regressions;
no parallel state or new recurring process. A visible retained prefix is not
proof that the requested offset is ready. The same consumer release resource
must be locked across producer checkouts. Both boundaries have isolated tests.

## 2026-10-17 isolated source-control failures

Flow: bugfix, L2. The consumer reads a bounded recommendation/search/bookmark
window, reviews complete source bodies, then uses its original write workflow.
A missing/ambiguous expansion control currently throws past the collection
owner and discards other complete sources already read in that call. A missing
pagination anchor similarly loses the valid partial window. This failure-scope
problem is confirmed independently of the still-unproven transient DOM cause.

Keep the existing root APIs and collection owner. On a recognized DOM control
ambiguity or selector deadline during one source expansion, make one fresh
read-only observation of the same list window. Continue with other candidates
only when its page and nonempty account match the prior frame and it has no
alert or unconfirmed state. Exclude the failed source entirely; never accept its
truncated body or retry its click. Other errors, including connection failures,
propagate. An unsafe recovery frame stops with the prior complete sources and
an explicit incomplete boundary. An unconfirmed pagination control stops this
window, retains its complete sources and reports an incomplete boundary; it
does not navigate/scroll again or claim the whole feed was read.

The original DOM uniqueness guard remains strict. Its failure reports add only
the operation name and observed match count, without content, identity or URLs.
This is not a new write/retry/permission protocol or a global backoff rule.
Ads/loading placeholders and other existing needsStateCheck conditions remain
blocked; changing their classification is outside this fix. No new dependency,
public argument, queue or schedule is introduced. Plan: not required.

Golden paths: (1) complete A, failed expansion B, complete C -> fresh same-page
identity -> return A/C for original review, never B; (2) alert, changed identity
or page during that fresh check -> stop, no C; (3) complete A then absent page
anchor -> return A with explicit partial coverage, no second scrolling attempt.
Connection failure never becomes a partial-success recovery.

Design review: passed for this bounded owner change. Retaining only fully
observed source bodies preserves consumer review and write guards; the unsafe
frame and transport counterexamples are Required regressions. No new public
capability or relaxed selector is needed. AI validation covers synthetic failure
isolation, route/account/alert rejection, original source/readiness consumers,
types/build/maintainability and actual root read adoption. Real account proofs
remain only in the consumer. Parent operational target remains open.

Implementation review: no findings. The unchanged strict DOM guard rejects
missing/ambiguous controls without acting. Recovery is limited to recognized
read-control errors and an actually fresh same-page, same nonempty account,
alert-free frame. Connection errors propagate. A pagination control failure
stops the bounded window rather than restarting it.

Validation: the prior build fails four diagnostic and ten isolation expectations;
the new build passes 74 targeted and all 573 source tests, TypeScript/build,
format checks and the existing maintainability checks (including the three
changed code files). The actual consumer root read adopted the checked local
build and returned five complete Home/For-you source cards with real provenance.
This live read proves adoption, not that a natural transient failure was replayed
or that all feed pages are available; fault isolation is proven at the assembled
collection/DOM regression boundaries. No test post or retry of an unknown write.

Delivery: checked local runtime, precise source delivery, no standalone npm or
consumer package-version change; next related consolidated release follows the
maintenance owner. Retrospective decision: retain source-local failure scope and
its regressions in the existing owner, preserve strict selection and global
refusal boundaries, and add no AGENTS/Skill rule or parallel recovery queue.
The consumer's daily operating target remains open.
