# X Harness

Named X task APIs for browser-enabled AI agents. A reading task returns the relevant complete text and evidence; a write task records intent, submits once, verifies the public result and settles the user's ledger. Default receipts are compact; `decision` keeps complete target evidence; `delta` only returns changed evidence.

Website: https://x-harness.gemigo.app/

## Install and update

```sh
npx @nextclaw/x-harness@latest setup --target codex
npx @nextclaw/x-harness@latest update --target codex
```

Requires Node.js 22.13+ and a compatible browser-enabled AI host. Codex desktop with CUA is the validated host. `--target claude` installs Skill text into Claude's Skill directory; the Claude host must separately provide compatible CUA tab/app methods. Installing text alone does not add browser control.

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

Source windows accept `excludedHandles`: known authors are skipped before card expansion and do not consume the requested result capacity. Search continuation retains its confirmed cursor. This is discovery filtering, not semantic approval or write authorization.

Normal reply and incoming-like pacing defaults to 30 seconds. An original ledger may carry an explicitly authorized `interactionPacing` policy with `minimumIntervalMs`, `notBefore`, exclusive `notAfter`, and an existing `evidenceRef`. An expired policy restores the default; malformed or unproved policies fail closed. Thread-like pacing and actual platform refusals remain independent. This configuration does not promise any throughput.

Bulk list audit: `readFollowbackAudit` saves deduplicated relationship lists and resumable coverage evidence. Followback direction reads unfiltered followers; unmatched profile counts remain incomplete. See [the API reference](skill/references/followback-audit.md). `followBatch` optionally persists bounded random intent gaps, while retaining all original budget, refusal and unknown guards.

Write APIs: `publishPost`, `replyToPost`, `followOne`, `followBatch`, `runGrowthRound`, `likePostAndComments`.
Recovery: `verifySubmission`, `verifyPublishedPost`, `verifyFollow`.

First connection can use the asynchronous `createXGrowthHarness({connection, ledgerPath, proofDirectory})` overload. Supply two documented host callbacks: `connection.check()` is read-only browser discovery (for CUA, `cua.listTabs({browser: selectedBrowserId, emit:false})`); `connection.openTab()` opens your independent HTTPS X tab using `cua.createBrowserTab`. Name the browser session as required by its current documentation. The factory retries only the exact request-header initialization error once during the read-only check, then opens at most one tab. It never retries tab creation, business reads or submissions. A `ready` result contains `harness`, `tab` and a compact `connection` receipt; reuse them. A failure returns its phase, stable reason and local proof reference. Recovered failures retain their original error and timing locally; an HTTP cause hidden by the host remains unknown. This does not patch or bypass the desktop host's policy.

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

The private parent content repository consumes the published npm package. These are two independent Git repositories; the parent development workflow can maintain this checkout directly. Account ledgers, browser evidence, publishing contracts and content-specific context adapters remain in the parent. They are not dependencies of this project.

### Prepare without submitting

`runGrowthRound({taskId, maxActions:0, decision:{type:'prepareActions', accountHandle, ownershipEvidenceRef, actions}})` saves reviewed candidates in the original ledger without browser navigation, unknown verification or submission. This works during write backoff; qualification reads remain separate normal task APIs. It returns `checkpoint`, `mayEnd:false`: preparing a queue does not complete the original goal. Existing IDs, target capacity, scope and evidence gates remain in force; zero without a preparation decision is rejected.

### Selected thread likes

`likePostAndComments({url, sampleRate:0.6})` discovers the selected post and its loaded replies internally, likes the root and a stable sample of comments, skips existing likes and persists intent/recovery in the original ledger. No caller comment list is needed. Serial submissions use a 1–2 second load interval including verification; no detection-evasion techniques are used. Default per-call bounds are 20 new likes, 40 advances and 120 seconds; checkpoint/waiting resumes the same batch, and scopeComplete is always false. See Skill [Thread likes](skill/references/writes.md#thread-likes) for exact limits and statuses. X rules prohibit automated likes; sampling and pacing do not guarantee permission or avoidance of restrictions.


### Creator history and metrics

Use readCreatorHistory({ handle, from, maxWindows: 4 }) for bounded bulk profile reads instead of model-driven per-post navigation. Its compact receipt returns unique counts, incomplete coverage and immutable per-window evidenceRefs for batch ingestion. Resume with the returned evidenceRef on the same profile viewport; wrong scope or cursor changes refuse. The checkpoint contains IDs and proof references, while the original window proofs retain full text, metrics and actual observation times. This capability performs no writes to X and does not infer hidden or deleted content.

Native Chrome publishing can use the same root APIs when extension page control is unavailable. Scoped native executors supply a real independent `nativeTaskTab:{id,evidenceRef}`; select that owned tab with documented CUA controls before binding. See the installed Skill's connection and publishing references. Submission stage proofs and the original action's `resultEvidenceHistory` retain failures through subsequent read-only recovery; no unknown action is resubmitted.

### Project-owned original publication admission

A binding may provide a synchronous `originalContentGuard({draftPath, text})`. Return `null` to admit or a stable reason code to reject. The original ledger can require this binding with `execution.originalContentGuardRequired: true`, and can hold all new original submissions with `execution.originalContentHold: true`. These checks run both before intent and again at the shared final submission boundary, including independent/scoped publication. Missing, failing or invalid guards fail closed; reply and follow actions retain their own policies. Put account/editorial policy in the consuming project rather than the SDK. Receipt recovery remains read-only while a content hold is active.

### No routine account precheck

Publishing (including independent calls), replying, following and incoming-like verification use identity already returned by their necessary business observations. They do not perform a separate `readAccount`/`inspectAccount` preflight, and ordinary write capability does not require an account-only reader. Do not add such checks, account-page navigation or reloads in callers. Explicit account diagnostics and recovery after a real failure remain available; they are not per-action or daily prerequisites. Local DOM observation is not itself an X HTTP request; repeated document loads can bootstrap X Viewer/settings requests.

### Independent pages and atomic ledger writes

Read-only task calls do not register persistent account-ledger activity. Different owned tabs can read and work independently. FileRoundStore coordinates only the synchronous Markdown commit using Node SQLite; it never holds an account-wide file lock over an async callback or browser operation. The adjacent SQLite file contains only coordination metadata, not business state. Mutation callbacks can be recomputed after a revision conflict and must contain no platform writes. Original action claims, unknown submissions, account refusals and public verification remain in force.

The former `.x-harness.lock` pathname is used only during the synchronous commit for compatibility with older SDKs, then removed. It is never held over browser I/O. If a new native writer is interrupted, the next native statement can prove exclusive ownership and remove its own orphaned compatibility artifact without a PID or age heuristic. Foreign legacy owners still require their original recovery evidence. New and old bindings can finish and upgrade at their own safe boundaries; no all-duty stop barrier is required. `withLock` is a local compatibility edit session; serializable decisions always use `transaction`.
