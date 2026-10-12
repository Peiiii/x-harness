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
| SW-4 | Reviewed npm artifact identity, consumer validation and necessary live source read | pending |

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
