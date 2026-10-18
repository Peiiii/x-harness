# Follow pacing waiver at an explicitly authorized opening

Flow: bugfix; risk L3; active contract FOLLOW-OPENING-20261019 revision 1.
User goal: substantially improve verified follow throughput. This repair removes an
unintended one-hour internal-policy block; sustained platform throughput remains a
separate required live measurement, not a claim made by synthetic tests.

The existing same-day pacing waiver rejects starts before 07:00 even when the
same executor has an explicit 06:00 follow window. Keep the ordinary 07:00 floor.
For the 06:00–07:00 interval only, recognize the existing windowAuthorization when
its kind/executor/signature/evidence and current same-day bounds all match. Require
the pacing permit to start within that window. Do not introduce a second permit,
change stores, remove real-refusal handling, or bypass identity/deduplication.

Required acceptance:
- A1: an actual caller's paired 06:00 permits waive internal pacing at 06:00;
  otherwise the early-hour policy remains unchanged. Old default 07:00 works.
- A2: absent/wrong/unsigned/missing-proof/future/overnight windows, pre-06 starts,
  expired and cross-midnight permits cannot waive early-hour pacing.
- A3: root followBatch executes ten distinct approved actions with the valid early
  window, accounts attempts and never resubmits verified actions; real refusal stops.
- A4: exact tested build is adopted by the original executor, and first live
  batches report actual verified count, elapsed time and any real platform gate.

Owner: follow-observation-policy.ts; consumer: existing followOne/followBatch gates.
Golden chain: original executor loads current same-day permits -> root followBatch
checks the existing window and pacing waiver -> serial guarded writes and persistent
verification -> original state settlement. Before/after use identical synthetic
06:30 state with recent attempts exceeding internal defaults. No X requests in tests.

Plan: one patch batch; local isolated worktree protects unrelated primary WIP.
Design review (before implementation): passed. Paired-window reuse keeps the existing
authorization owner; explicit 06 floor and midnight bound prevent general night
expansion. No new fields, public API, retries, scheduling or platform quota.
Live speed is not proven by this authorization correction; measure after opening.

Implementation review: no open findings. The default 07:00 branch and existing
executor/account/task/proof matching remain; early authorization additionally
requires the waiver end not to exceed the explicit window. No write/retry code changed.
Validation: old implementation fails the valid 06:30 regression; repaired root API
executes ten synthetic actions despite recent internal-budget attempts, preserves
110 attempt records and makes no second writes for the same verified IDs. All 616
SDK tests, typecheck, build, formatting of changed source/tests, and diff-only plus
package maintainability pass. A1–A3 passed; A4 live adoption/result pending in the
consumer's original monitor record. No npm release is required for tested local use.
Retrospective: a pacing-waiver floor must respect an existing explicit operating
window rather than silently imposing a different opening. Boundary/root tests now
protect this divergence; no new scheduler or configurable pacing ceiling added.
