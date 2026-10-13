# Preserve observed replies across detail navigation timeout

## Goal and acceptance contract

Repeated detail URL waits discard a fresh, uniquely matched public reply candidate. The original action stays unknown and callers need extra model-directed recovery. MAINT-002 now meets its repeated operational cost trigger.

R1: retain the actual observed own-account permalink when detail navigation times out, permitting the existing root batch’s single read-only verification. Do not submit again.
R2: author, complete text, unique ID, absolute intent time, alerts and exact parent remain mandatory for success; absence or mismatch remains unknown.
R3: a submission timeout without an observed receipt does not invent a link or count as success. No new retry loop or inferred IDs.
R4: source checks, release checks and published consumer checks precede real read-only recovery. Overall throughput of several times ordinary posting remains unproven without a comparable baseline; this repair alone cannot establish it.

## Design and design review

At the existing candidate-detail boundary in PlatformWriting, narrowly catch URL-wait timeouts. Keep the fresh candidate observation and its link; continue through the exact-parent filter. The existing state owner validates and persists the receipt candidate and replyBatch already attempts one recovery. Other errors propagate. No API, state schema or business policy changes.

Same-executor design review: a parentless candidate cannot pass the final parent filter. The URL is read from public observation and validated against the original account and candidate ID before navigation. A failed open leaves the previous observation intact. Retained editor timeouts remain unknown.

## Implementation review and source evidence

Diff-only review: candidate navigation remains bounded, non-URL failures propagate, and missing parent never verifies. The root API test simulates a detail timeout then a correct or wrong parent: one submission in both cases, success only for the exact parent, and the observed original-action URL retained. Existing negative author/text/time/alert/duplicate coverage remains passing. Full check passes 217 tests plus format, type, CLI/contracts, maintainability, Skill and generated consistency. Release artifact tests require the committed build and are run after it. Live recovery and overall multiplier remain unverified.

Published 0.2.46 from committed c242fc8; registry visibility and consumer integration confirmed. Four artifact/release tests and 193 consumer tests pass. Original no-link unknown remains unknown under published read-only recovery, with no resubmission. Live URL-timeout branch and comparative throughput remain unproven.
