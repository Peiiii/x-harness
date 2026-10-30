# Recovery by signal

Failures only: keep operation/status/missing/code/proof/error; no guessed success or unchanged retries.

| Signal | Next action and exit condition |
| --- | --- |
| unknown submission | `await x.verifySubmission({taskId,actionId})`, same IDs; no resend. [Observed link](receipt-recovery.md). |
| Existing public post needs recovery | `await x.verifyPublishedPost({taskId,draftPath,publicURL,evidenceRef})`; [timeouts](public-recovery-search.md); [link proof](source-link-recovery.md). |
| Follow needs independent recovery | `await x.verifyFollow({handle,url,evidenceRef,mode:'decision'})`; Honor verified. followBatch already verifies. |
| needsDecision | Current AI resolves review/proof under project contract; resume original ID. |
| waiting | Honor resumeAt/reason, continue independent permitted work; never bypass time/identity/claim gates. |
| needsCapability | Identify operation: one supported rebind, else repair owner with failed sample/verification. |
| diagnostic.next: inspect-local-proof | Read `{operation,error}` from diagnostic.evidenceRef; full proof stays local. Verify unknown/intent by original ID. Unsupported: report code/error for update/support; no private source. |
| diagnostic.next: restore-proof-store | Restore writable workspace proof directory; resume same action/ledger, no inferred submission failure. |
| Missing fields/partial window | Narrow target; documented bounded expansion/paging, preserve text. No whole-page output/reload. |

## Host connection or native focus

### Stale page at retryAt

After Retry-After/retryAt, reload only the owned draft-free page once; root inspectAccount must prove fresh, complete, matching identity before original IDs resume. No draft loss or unknown resend. Missing identity/transport/old logs are not new429: inspect current diagnostics, change the failing condition. Only current business429 renews backoff. Success proves recovery, not cause; normal partial windows never trigger reload.

Naming failure is not logout. Use a real Chrome owned tab and root read; preserve editors, policies and network. After reset rediscover Chrome. Native focus rejection allows one fresh observed correction. Reading success proves only reading; app fallback retains root calls.

`tab-busy`: [claim recovery and independent continuation](claim-continuation.md).

## Repair boundary

Unresolved defects/gaps: maintainers repair/verify the owner, return to root. Consumers report gap/update/support, without source. No argument scans/parsers, refusal bypass or unknown resend.


Passive request evidence: [observation](network-observation.md).

[Stage logs](submission-diagnostics.md).

Target-local claim: [continue independent batch members](claim-continuation.md); do not release old claims.
