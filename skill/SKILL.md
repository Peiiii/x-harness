---
name: x-harness
version: 0.2.1
description: Use X through task APIs with compact receipts, complete target evidence and verified writes; requires compatible CUA and the user's X login.
---

# X Harness

Use the root business API. Load only the current task reference; reuse unchanged instructions and a valid binding. Normal use needs no implementation source or type-file reading.

## Bind once

Use current CUA docs and one real `tab`/`app`; preserve others' editors. First connection: [automatic binding](references/connection.md). Reuse valid bindings.

Installed module: `{{MODULE_URL}}`; CLI: `{{CLI_PATH}}`.
In development, use `<harness-repository>/dist/index.js` as an absolute file URL with existing ledger/proof paths. Unresolved placeholders: retain the existing runtime. Only missing runtime/workspace or updates need [setup](references/setup.md).

```js
var { createXGrowthHarness } = await import(moduleURL);
var x = createXGrowthHarness({ tab, ledgerPath, proofDirectory });
```

## Load by task

| Current need | Read only |
| --- | --- |
| Creator/bookmarks/search/post/person/feedback/account | [reads](references/reads.md) |
| Publish/reply/follow or a round | [writes](references/writes.md), preamble + common review + matching operation heading |
| Unknown submission, missing capability or connection failure | [recovery](references/recovery.md) |

Default `receipt` is for status; use `decision` on the first call needing content, `delta` for changed evidence with valid prior context. Keep observations in REPL/proof; return complete relevant evidence and actionable warnings. Never truncate target text or print full DOM/AX. Root calls own capability checks, intent, submission, verification and settlement; verified results need no extra preflight/reload/verify.

Writes require user authorization, verified identity, reviewed evidence and the original ledger plan; project rules own policy. Unknown submission: verify the same action before any new submission. Follow recovery for other failures; read source only to repair a concrete defect/unsupported capability, verify, then return to root calls.
