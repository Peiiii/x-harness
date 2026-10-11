# Recovery by signal

Load on failure/unknown only. Keep operation/status/missing/code/proof/error; never infer success or repeat identical failures.

| Signal | Next action and exit condition |
| --- | --- |
| unknown submission | `await x.verifySubmission({taskId,actionId})`, same IDs; no replacement action or new submission before resolution. |
| Existing public post needs recovery | `await x.verifyPublishedPost({taskId,draftPath,publicURL,evidenceRef})`; observed URL/proof. Optional sourceLink: {href,resolvedURL,evidenceRef,renderedText?}. |
| Follow needs independent recovery | `await x.verifyFollow({handle,url,evidenceRef,mode:'decision'})`; honor returned verified. Normal followBatch already verifies. |
| needsDecision | Resolve returned missing review/proof in original action, resume same ID. Current AI performs internal review under project contract. |
| waiting | Honor resumeAt/reason, continue independent permitted work; never bypass time/identity/claim gates. |
| needsCapability | Inspect exact missing method/operation. If a supported binding supplies it, rebind once and retry a necessary read; otherwise repair reported owner with failing sample and targeted validation. |
| diagnostic.next: inspect-local-proof | Read only `{operation,error}` from diagnostic.evidenceRef; resolve via this reference, keep full proof local. Unknown/intent needs same-ID verification. Unsupported: report code/error and update/support; no private source. |
| diagnostic.next: restore-proof-store | Restore the workspace's writable proof directory, then resume the same action. Do not replace its ledger or infer submission failure. |
| Missing fields/partial window | Narrow to target, expand/advance documented bounded window; preserve text. No whole-page output or automatic reload. |

## Host connection or native focus

Failure to list/bind Chrome is a host-connection failure before reaching X, not proof of logged-out X. Per current host documentation rediscover the task tab once; validate navigation plus a necessary visible read. Native focus rejection instead needs latest AX URL/window confirmation and one supported focus correction. Do not repeat discovery or restart editors blindly.

Lost tab: reuse a live owned tab or create a task tab in the same actual browser; preserve other editors. Native fallback changes binding to app, not business calls; unsupported native tasks remain gaps. Network/TUN observations do not authorize setting changes.

## Repair boundary

Normal use/known recovery need no source. Unresolved runtime defect/unsupported capability permits diagnostics: maintainers repair the owner, verify the failed boundary and return to root; consumers report gap/update/support, without private TS. Never scan adapters for arguments, add parsers, bypass refusal or resubmit unknown.
