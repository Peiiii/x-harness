# Submission idle timeout recovery

Flow: bugfix. Scope: DOM submission completion; original receipt verification remains authoritative.

Observed boundary: a reply was publicly created, but the host timed out waiting for networkidle after the submit click. Background traffic can prevent network idle independently of a successful submission. The caller then skipped receipt verification and retained an unknown result.

Required behavior: retain the beforeSubmit gate and one click, wait for the submitted editor to disappear, and attempt the existing bounded idle wait. Only the explicit networkidle timeout may continue into the existing fresh receipt verification. No retry, success inference, or additional click is introduced. Browser disconnection and editor completion failure still propagate.

Design review: idle cannot prove creation or failure; only a fresh receipt matching author, full body, ID, time and direct parent can mark verified. The narrow catch preserves this contract. Removing all waiting or treating any exception as success was rejected.

Validation: synthetic tests cover reply/post idle timeout, disconnection, and editor completion failure. Existing root API tests retain unknown and no-resubmit behavior. Runtime acceptance uses original unknown actions for read-only verification and the next independent reviewed reply for submission when available.

Implementation review: no persistence schema, policy, root-age or recipient-binding changes. The catch matches only the observed timeout text; unrelated errors propagate.

Retrospective: post-click page idle is a readiness hint, not a business receipt. Preserve unknown ownership and use the existing receipt path.
