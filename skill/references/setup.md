# Setup and updates

Load only when runtime/workspace is absent, binding needs refreshing after update, or adapter scope changes.

## Repository runtime

Use `<repository>/dist/index.js` as an absolute file URL; if absent run `npm run build`. Reuse original ledger/proofs and private parent runtime-context entry; do not initialize a second ledger or download another runtime. Use this repository’s skill/ as the development Skill owner.

## Independent installation

Requires Node 22+, compatible CUA and own X login. Run `npx @nextclaw/x-harness@latest setup --target codex` (or `--target claude`); use returned moduleURL/cliPath. Setup substitutes placeholders. Skill text does not add browser access. Missing host/login is a prerequisite, not permission to invent execution.

Initialize once: `node <cliPath> init --directory <user workspace> --account <user handle>`. Reuse returned ledgerPath/proofDirectory/taskId; initialization plans zero writes. Existing project state remains its owner.

## Adapter and parallel scope

Host owns tab/app acquisition: read its current documentation once and reuse the valid handle. Tab needs url(), playwright.evaluate() and locators; native app AX/click/key/paste. Do not launch a separate driver.

Native binding: `{app,ledgerPath,proofDirectory}` instead of tab. Independent task tabs may add `executor:{id:taskId,scopeKinds:['original'],evidenceRef:scopeProof}` using actual authorized scope/proof; kinds are original/reply/follow. Never borrow another executor's editor or claim.

## Update

Independent installs run `npx @nextclaw/x-harness@latest update --target codex` (or claude); it backs up managed runtime/Skill and preserves workspaces. Repository users update the original repository owner. Rebind using the new versioned moduleURL returned by update or written into this Skill; it refreshes the whole dependency graph in a persistent REPL. Never reuse the previous URL or add a root-only query string. Preserve pending actions/editors; reacquire the task tab after a necessary host reset. Verify one necessary read with the new module, not all documents. Distributed Skill/runtime share a version. Free use follows bundled proprietary license; TS source remains private.
