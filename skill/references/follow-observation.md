# Same-day follow observation authorization

Only use after an explicit user instruction to suspend internal follow pacing for a single day and observe real platform limits. This does not authorize bypassing a platform refusal, unknown resubmission, identity/quality checks, batch-size checks, incomplete history, or the night boundary.

In the original ledger, CAS-update only the current executor's `followObservationAuthorization`:

```js
var { createFileRoundStore } = await import('@nextclaw/x-harness/diagnostics');
var store = createFileRoundStore({ ledgerPath, proofDirectory });
await store.transaction(({ state }) => {
  var execution = state.executions[executorId];
  if (!execution || !execution.scopeKinds.includes('follow')) throw Error('follow executor missing');
  execution.followObservationAuthorization = {
    kind: 'follow', executorId, taskId: state.batchId,
    accountHandle: state.accountHandle, userAuthorized: true,
    evidenceRef: authorizationProof, startsAt, expiresAt,
  };
  return state;
});
```

The permit requires an existing proof, exact executor/task/account, follow scope, and a start no earlier than 07:00 Shanghai that day. It expires automatically at or before midnight. The ordinary authorized time window still applies separately. Valid permits suspend only internal rolling follow budgets and group cooldowns for that executor; preserve all actual attempts and follow-group records. Other executors keep their usual policy.

Use the root `followBatch` API normally, retaining 5–10 handles and original IDs. Resume an interrupted group with its complete original handles. On genuine platform restriction, stop submissions, save actual attempts, verified results, raw restriction evidence and recovery time in the original ledger, and back off under the project contract. A profile read timeout alone is not proof of a follow restriction. Report empirical observations as observations, not guaranteed platform thresholds.
