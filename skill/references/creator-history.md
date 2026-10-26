# Bulk profile history and metrics

Profile metrics at scale: readCreatorHistory scans the explicit range in one bounded root call. Consume evidenceRefs as one ingestion batch; each original window retains its own observation time. Resume with evidenceRef only on the same live profile viewport. A moved cursor refuses; start fresh without resume to rescan. complete means observed date-boundary coverage with complete text, never an exhaustive claim about hidden/deleted posts. Partial text gaps and interruptions preserve earlier proofs. Receipt omits post bodies.

```js
const from = "2026-01-01T00:00:00Z";
const result = await x.readCreatorHistory({ handle, from, maxWindows: 4 });
// Batch-ingest result.evidenceRefs, or resume the same live profile:
const next = await x.readCreatorHistory({ handle, from, resumeEvidenceRef: result.evidenceRef });
```

The checkpoint is immutable; keep the latest reference. It binds handle, absolute range and visible cursor. A budget exit is partial, not failure or a new scheduling request. Hidden/unavailable posts remain unknown. Keep real observation age when comparing cumulative metrics.
