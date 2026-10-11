---
name: x-harness
version: 0.2.0
description: Use X through task APIs with compact receipts, complete target evidence and verified writes; requires compatible CUA and the user's X login.
---

# X Harness

Use the root business API. Load only the current task reference; reuse unchanged instructions and a valid binding. Normal use needs no implementation source or type-file reading.

## Bind once

Read current host CUA documentation; bind a real logged-in `tab` or native `app`, exactly one. Preserve other tasks' tabs/editors.

Installed module: `{{MODULE_URL}}`; CLI: `{{CLI_PATH}}`.
In this repository use the absolute file URL of `<harness-repository>/dist/index.js` with original ledger/proof paths. Unresolved placeholders do not require reinstalling an existing repository runtime. Only absent runtime/workspace or an update needs [setup](references/setup.md).

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
