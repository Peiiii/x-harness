---
name: x-harness
version: 0.2.1
description: Use X through task APIs with compact receipts, complete target evidence and verified writes; requires compatible CUA and the user's X login.
---

# X Harness

Normal use needs no implementation source or type-file reading.

## Bind once

Use current CUA docs and one real `tab`/`app`; preserve other editors. [First connection](references/connection.md); reuse valid bindings.

Installed module: `{{MODULE_URL}}`; CLI: `{{CLI_PATH}}`.
Development: use `<harness-repository>/dist/index.js` as an absolute file URL with original ledger/proofs. Unresolved placeholders: reuse runtime. Missing runtime/workspace or updates: [setup](references/setup.md).

```js
var { createXGrowthHarness } = await import(moduleURL);
var x = createXGrowthHarness({ tab, ledgerPath, proofDirectory });
```

## Load by task

At scale use [batch discovery](references/batch-discovery.md). `discoverFollowCandidates` excludes followed rows from observed lists before profile review. Reuse queues; repair, verify, resume. No person-by-person search.

| Current need | Read only |
| --- | --- |
| Creator/bookmarks/search/post/person/feedback/account | [reads](references/reads.md) |
| Followback list audit | [audit](references/followback-audit.md) |
| Publish/reply/follow/thread likes or a round | [writes](references/writes.md), preamble + common review + matching operation heading |
| Unknown submission, missing capability or connection failure | [recovery](references/recovery.md) |

Use `receipt` for status, `decision` for first content, `delta` for changes with valid prior context. Keep observations locally; return complete target evidence and warnings. Never truncate target text or dump DOM/AX. No routine inspectAccount/account navigation/reload; diagnose faults only. Root owns intent and verification; never recheck verified writes.

Writes need authorization, verified identity, review and the original ledger plan; project policy applies. Unknown: verify original action, never resend. Follow recovery; repair concrete defects at the owner, verify and resume root calls.
