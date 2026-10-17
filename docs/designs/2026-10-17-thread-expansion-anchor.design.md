# Scoped thread disclosure anchors

- task-type: bugfix
- flow: bugfix
- risk: L3 (serialized browser observation to DOM activation)
- contract-id: x-thread-expansion-anchor-20261017
- scope-revision: 1
- status: acceptance-ready; source delivery recorded by commit
- design-revision: 2
- design-review: passed (revision 2; no findings)
- retrospective_state: completed; regression tests and original maintenance row own the reusable fix
- plan: not-required; one bounded repair in three existing owners, with this ledger retaining checkpoints

## User result and existing boundary

A caller resumes `readPostComments` on its original evidenced root and processed IDs. Two ordinary disclosure buttons with the same label should not prevent bounded collection when each can be uniquely tied to an observed branch. The caller receives newly observed comments, its earlier captured rows, and the actual pagination boundary. Hidden replies and a bounded tail never imply all comments on X were collected.

The existing label-only path refuses two identical labels before activation. This is a safe refusal, not a platform rate limit. The queued maintenance item THREAD-SCOPED-EXPANSION-ANCHOR owns the defect. A synthetic reproduction on the unchanged implementation confirms zero expansions despite distinct observed branch anchors; the adjacent thread/read-comment baseline has 43 passing tests.

The wider consumer collection and follow campaign remain ongoing. This repair does not complete that campaign or authorize reactions, relationship changes, source-quality exceptions, or extra scheduling.

## Existing owners and proposed model

`readThreadLikeSurface` owns read-only scope and disclosure observations. `PlatformThreadLikes` selects an unambiguous observed control and retains the current root/account lifecycle. `DOMEditing.handleExpandThreadReplies` validates the same descriptor against its current observation and activates exactly one matching control. No consumer-side selector fallback or new public task API is introduced.

The optional transient descriptor is `anchor:{postId,primary}`. It identifies a layout anchor, never an inferred reply-to edge. The observed ordinary disclosure occupies an empty `cellInnerDiv` immediately after a sibling cell containing one visible in-thread article and its exact timestamp permalink. A read-only diagnostic probe confirmed this layout on the original root without changing activation. The earlier enclosing-article/cell proposal was rejected: the control has no enclosing article and its own cell has no article.

The observer emits an anchor only when the disclosure cell is empty of articles, its immediate previous sibling is a cell with exactly one visible non-ad article already in the confirmed thread, and the observed timestamp path identifies that article (including the existing edited-history form). No nearest-earlier-row search or positional/nth selection is allowed.

Selection prefers a unique exact-label-plus-anchor tuple. An unanchored control retains the existing exact-label-unique behavior: that remains a supported layout. A supplied invalid or colliding anchor cannot silently fall back to label selection. Duplicate labels without unique anchors still refuse and retain partial evidence.

DOM activation validates the same descriptor against the current observation, then locates the adjacent disclosure cell through the exact timestamp permalink in the previous cell. It requires a unique cell and a unique exact-label button. Original root, account, alert, current-observation and membership guards remain. The account observed at the initial confirmed root remains the baseline across advances; reset clears it with the existing root lifecycle. No new public parameter is required.

## Alternatives and constraints

- Arbitrary first/nth matching label is rejected: it does not bind the branch and can expand unrelated content
- An exact observed permalink plus immediate sibling-cell relationship is the narrow owner-level repair; no new registry or caller protocol
- If actual containers do not supply a unique anchor, refusal remains correct and the design must be revised with that evidence

The optional anchor fields propagate through the serialized observer, platform selector, command validation, and DOM locator. There is no new closed variant. They are transient observation/command data; original task inputs, action/intent persistence and public entry points do not change. Generated observation output is rebuilt from the same source. Existing bounds, edited timestamp identity, ads/recommendation exclusion and captured-data preservation remain.

## Golden acceptance

1. An existing caller uses the same `readPostComments` root/evidence/processed IDs. A same-label pair has distinct unique branch anchors. One disclosure expands, the fresh next observation contains additional in-thread comments, and the bounded receipt is settled through the original consumer record
2. Missing/colliding anchors, wrong root/account, alerts or stale/mismatched descriptors activate nothing and keep the already captured data and an explicit incomplete boundary
3. Ordinary unique-label layout and the existing thread-likes caller keep their established behavior; a comment-read call creates no reaction or submission intent

AI performs build, directed and neighboring checks, implementation review and one authorized original-root read. The consumer retains real account evidence privately; this repository contains only synthetic fixtures and anonymous adoption summaries. Local verified adoption is allowed before a consolidated npm release. Existing unrelated staged refactor work is protected in an isolated checkout.

## Active acceptance ledger

| ID | Required | Contract | Status | Current evidence |
| --- | --- | --- | --- | --- |
| TA1 | true | Reproduce the old duplicate-label boundary without platform writes | passed | `test/thread-expansion-anchor.test.mjs` fails on the unchanged implementation; adjacent 43 tests pass |
| TA2 | true | Confirm the actual original-root container/permalink relationship used by the repair | passed | Consumer-retained read-only probe: one empty disclosure cell immediately follows a one-article cell with its exact timestamp; actual duplicate-label activation remains TA6 |
| TA3 | true | Producer, platform and DOM activation bind one unique in-thread branch | passed | Observer / platform / exact adjacent DOM fixture; authorized real read adopted the same serialized descriptor |
| TA4 | true | Absent/colliding/mismatched anchors, account/root change, alerts and excluded regions refuse safely | passed | Missing/collision/path/account/root/alert/stale and ad/hidden/nonadjacent/ambiguous-cell matrix |
| TA5 | true | Existing unique-label/edited-link/bounds/partial-data behavior remains; no read-created reaction or intent | passed | 58 directed neighboring checks; 592 package tests; original root API still read-only with bounded partial evidence |
| TA6 | true | Authorized root task advances the original ambiguity and settles real bounded observations | passed | Private original-root task showed two identical labels with distinct observed anchors, then one and none; 13 additional source records settled in the original consumer record across two roots; whole collection remains incomplete |
| TA7 | true | Type/build/generated-output/maintainability and implementation review pass; precise source delivery preserves other WIP | passed | npm run check passed (592 tests), 58 directed checks, generated transport and type contracts passed; implementation review no findings; precise isolated source commit, normal fast-forward main delivery tracked by consumer |

Open Required IDs: none after successful source push; the consumer records its actual push receipt separately. Design revision 2 remained unchanged during implementation. Implementation review: no findings after checking serialized ownership, exact descriptor/account lifecycle, stale/collision refusal, root bounds and regenerated transport. The repository has no diff-only maintainability mode; its existing full guard passed with zero findings. No new public variant or API entry was introduced. Reusable learning stays in the regression matrix and original maintenance row; no new global rule is needed. npm/website release is deferred to consolidated maintenance; verified local adoption is separate from public publication. The wider consumer collection and daily follow target remain incomplete.
