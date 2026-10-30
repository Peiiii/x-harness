# Setup and updates

Load for missing runtime/workspace, updates or adapter changes.

## Repository runtime

Use `<repository>/dist/index.js` (absolute file URL; build if missing). Reuse the project runtime-context, ledger and proofs. Source Skill owner: skill/. Do not create another ledger/runtime.

## Independent installation

Requires Node22+, compatible CUA and own X login. Run `npx @nextclaw/x-harness@latest setup --target codex` (or claude); use returned moduleURL/cliPath. Setup fills placeholders, grants no browser access. Missing host/login remains a prerequisite.

Initialize once: `node <cliPath> init --directory <user workspace> --account <user handle>`. Reuse returned ledgerPath/proofDirectory/taskId; initialization plans zero writes. Existing project state remains its owner.

## Adapter and parallel scope

Host owns tab/app acquisition: read its current documentation once and reuse the valid handle. Tab needs url(), playwright.evaluate() and locators; native app AX/click/key/paste. Do not launch a separate driver.

Native binding: `{app,ledgerPath,proofDirectory}` instead of tab. Independent task tabs may add `executor:{id:taskId,scopeKinds:['original'],evidenceRef:scopeProof}` using actual authorized scope/proof; kinds are original/reply/follow. Never borrow another executor's editor or claim.

## Update

Independent installs run `npx @nextclaw/x-harness@latest update --target codex` (or claude); it backs up managed runtime/Skill and preserves workspaces. Repository users update the original repository owner. Rebind using the new versioned moduleURL returned by update or written into this Skill; it refreshes the whole dependency graph in a persistent REPL. Never reuse the previous URL or add a root-only query string. Preserve pending actions/editors; reacquire the task tab after a necessary host reset. Verify one necessary read with the new module, not all documents. Distributed Skill/runtime share a version. Use the license bundled with the runtime.

## New daily executor

For an existing daily plan with an unregistered executor, use the public prepare-only call once; there is no registerExecution API:

```js
await x.runGrowthRound({taskId,maxActions:0,decision:{type:"prepareActions",accountHandle,ownershipEvidenceRef:accountEvidenceRef,actions:[]}});
```

Reuse original task/ledger, authorized executor and existing account proof. This registers locally, performs no browser work, preserves queued actions/unknowns. Missing daily plans use the project preparation entry; never edit executions or create another ledger.
