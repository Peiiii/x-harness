# X Harness

Named X task APIs for browser-enabled AI agents. A reading task returns the relevant complete text and evidence; a write task records intent, submits once, verifies the public result and settles the user's ledger. Default receipts are compact; `decision` keeps complete target evidence; `delta` only returns changed evidence.

Website: https://x-harness.gemigo.app/

## Install and update

```sh
npx @nextclaw/x-harness@latest setup --target codex
npx @nextclaw/x-harness@latest update --target codex
```

Requires Node.js 22+ and a compatible browser-enabled AI host. Codex desktop with CUA is the validated host. `--target claude` installs Skill text into Claude's Skill directory; the Claude host must separately provide compatible CUA tab/app methods. Installing text alone does not add browser control.

The runtime lives in `~/.x-harness/runtime`; the Skill is managed in the selected host's Skill directory. Updates preserve your independent workspaces, back up the previous runtime and Skill, and refuse to overwrite unrecognized directories. Bind the new moduleURL reported by update; its versioned path refreshes the complete module graph, including in a persistent REPL. The stable CLI entry remains usable.

Initialize your own workspace (use the stable CLI path reported by setup):

```sh
node ~/.x-harness/runtime/node_modules/@nextclaw/x-harness/cli/main.js init --directory ./x-workspace --account your_handle
```

Setup prints the absolute module URL and CLI path. Ask your agent to use the installed `x-harness` Skill. Your agent binds a real logged-in CUA tab once, then uses `createXGrowthHarness({ tab, ledgerPath, proofDirectory })`. It does not use your publisher's account or ledger.

```js
const { createXGrowthHarness } = await import(moduleURL);
const x = createXGrowthHarness({ tab, ledgerPath, proofDirectory });
const result = await x.readCreator({
  handle: "your_handle",
  target: 5,
  mode: "decision",
});
```

Read APIs: `readCreator`, `readBookmarks`, `searchSources`, `readPost`, `readPerson`, `readFeedback`, `inspectAccount`, `inspectRound`.
Write APIs: `publishPost`, `replyToPost`, `followOne`, `followBatch`, `runGrowthRound`.
Recovery: `verifySubmission`, `verifyPublishedPost`, `verifyFollow`.

Writing requires the user's explicit task authorization, reviewed prepared actions and their own ledger plan. Initialization enables no planned writes. Current runtime windows (Asia/Shanghai): originals/follows 07:00–22:00; replies 07:00–24:00. Follow any stricter original project contract; follow quality gates currently require reviewed Chinese-language, blue-check candidates. Read tasks do not require that candidate policy. Missing browser capability, login or decision evidence is returned explicitly. Unknown submissions are verified before any further submission.

Open source under AGPL-3.0-only. Corresponding TypeScript source and build scripts: https://github.com/Peiiii/x-harness. AGPL allows commercial use and requires corresponding source under its distribution/network-service conditions. This is not an official X product. See LICENSE for the complete terms.

## Development

```sh
git clone https://github.com/Peiiii/x-harness.git
cd x-harness
npm ci
npm run bootstrap
npm run check
```

Bootstrap installs the shared Qingtian AI development system and enables the staged Git hook. Its managed local files are excluded from Git and npm. Business owners use TypeScript classes with explicit constructor dependencies, private instance state and named methods. Pure functions and self-contained browser programs remain serializable. The file limit is 1000 lines; each hand-written source function has at most 150 own logic lines; runtime dependency cycles are rejected. Check/build/prepack/release and the staged hook reuse these rules.

The private parent content repository mounts this repository at packages/x-harness as a pinned Git submodule. Account ledgers, browser evidence, publishing contracts and content-specific context adapters remain in the parent. They are not dependencies of this project.
