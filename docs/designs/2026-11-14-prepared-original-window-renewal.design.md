# Prepared original action window renewal

## Goal

Allow `prepareActions` to move the calendar window of the same original prepared action when the calendar is rescheduled, without creating a replacement action ID or touching the browser.

## Acceptance path

- An existing original action with `status: prepared`, no intent, claim, public ID, or attempt may be updated using the same ID.
- The incoming action must match the stored action in every field except `notBefore` and `notAfter`; at least one boundary changes, supplied timestamps are valid, an existing boundary cannot be removed, and the effective end is after the start.
- Only those two fields change in persisted state. The operation remains prepare-only (`maxActions: 0`) and performs no browser reads or writes.
- Changed content, non-original actions, already claimed/attempted/submitted actions, and invalid windows continue to be rejected without ledger mutation.
- When an independent original execution includes a manual window authorization, its action ID, explicit authorization, expiration, and evidence are enforced before any write.

## Scope

Both prepare-only round paths share one pure validator, with synthetic coverage in `test/prepare-only.test.mjs`; the independent permit guard is covered by `test/native-compose.test.mjs`. Existing append behavior for new action IDs remains unchanged. No real account evidence or posting is part of this change.
