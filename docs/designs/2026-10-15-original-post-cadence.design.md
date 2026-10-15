# Original publication cadence

User asks to spread posts more evenly. This opt-in policy belongs to the original shared round ledger, not a second queue. `configureOriginalCadence` records an authorized minimum activation gap and its existing evidence reference. Consumers choose the interval; unconfigured consumers retain current behavior.

Before admitting a new original, return `waiting` with an absolute `resumeAt` when the previous original activation is too recent. Before the actual click, reserve `activatedAt` atomically in the same store and recheck the shared policy. Legacy verified/unknown originals without this field use their intent time conservatively. Unactivated concurrent intents do not block each other before reservation. A new reservation must still match the original action version; existing identity, quality, capacity, claim and window checks remain.

For serial execution already holding the store lock, save under that lock; parallel and independent paths use a transaction. A pre-click cadence wait restores prepared state and unknown accounting, preserves the attempt and returns a resumable wait; it never retries submitted/unknown actions. A resume time outside the original exclusive end is an explicit window conflict, never permission to extend it.

Required evidence: shared-root sequence with exact-boundary resume, atomic competing reservations, a competitor between admission and click, no-policy compatibility, unknown recovery, exclusive window end, independent publishing. Runtime adoption is separate from npm publication. Source and consumer records distinguish configured policy from real posting results.
