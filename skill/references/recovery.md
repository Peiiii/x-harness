# Recovery by signal

Load on failure/unknown only. Keep operation/status/missing/code/proof/error; do not infer success or repeat failures.

| Signal | Next action and exit condition |
| --- | --- |
| unknown submission | `await x.verifySubmission({taskId,actionId})`, same IDs; no replacement action or new submission before resolution. |
| Existing public post needs recovery | `await x.verifyPublishedPost({taskId,draftPath,publicURL,evidenceRef})`; observed URL/proof. sourceLink/sourceLinks: [link proof](source-link-recovery.md). |
| Follow needs independent recovery | `await x.verifyFollow({handle,url,evidenceRef,mode:'decision'})`; honor returned verified. Normal followBatch already verifies. |
| needsDecision | Resolve returned missing review/proof in original action, resume same ID. Current AI performs internal review under project contract. |
| waiting | Honor resumeAt/reason, continue independent permitted work; never bypass time/identity/claim gates. |
| needsCapability | Inspect exact missing method/operation. If a supported binding supplies it, rebind once and retry a necessary read; otherwise repair reported owner with failing sample and targeted validation. |
| diagnostic.next: inspect-local-proof | Read only `{operation,error}` from diagnostic.evidenceRef; resolve via this reference, keep full proof local. Unknown/intent needs same-ID verification. Unsupported: report code/error and update/support; no private source. |
| diagnostic.next: restore-proof-store | Restore the workspace's writable proof directory, then resume the same action. Do not replace its ledger or infer submission failure. |
| Missing fields/partial window | Narrow to target, expand/advance documented bounded window; preserve text. No whole-page output or automatic reload. |

## Host connection or native focus

Naming failure is not tab failure or X logout. Once, try a host-supported alternative: real Chrome → owned tab → root read. Preserve editors; no policy bypass/unchanged retries. Success proves current reading, not stable transport/writes. Reuse bindings; after real reset rediscover Chrome identity, not old numeric IDs. Native rejection needs fresh URL/window and one supported correction. App fallback keeps root calls; do not change network settings.

`tab-busy`: inspect proof/claim. Age/null PID is not termination. Only evidenced own-runtime termination permits CAS release matching executor/runtime/token, preserving intent/unknown and others. Verify same ID, never resubmit. Do not reset a working runtime to diagnose another error.

## Repair boundary

Source is only for unresolved defects/capability gaps: maintainers repair the owner, verify the failed boundary and return to root; consumers report gap/update/support, without source. Never scan adapters for arguments, add parsers, bypass refusal or resubmit unknown.
