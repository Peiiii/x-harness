# Explicitly authorized window

Default follow writes end at 22:00 Shanghai. If the user/project explicitly permits a later window, the existing executor-scoped permit supports it; no source inspection, SDK change or clock override is needed. Use actual Shanghai dates and an existing authorization proof. For a daily 07:00–24:00 contract, renew the permit at each day's resume; expire it at that day's midnight. Midnight is exclusive, and an expired permit never authorizes 00:00–07:00.

```js
var { createFileRoundStore } = await import('@nextclaw/x-harness/diagnostics');
var store = createFileRoundStore({ ledgerPath, proofDirectory });
await store.transaction(({ state }) => {
  var execution = state.executions[executorId]; // original authorized executor
  if (!execution || !execution.scopeKinds.includes('follow')) throw Error('follow executor missing');
  execution.windowAuthorization = {
    kind: 'follow', executorId, userAuthorized: true,
    evidenceRef: authorizationProof, startsAt, expiresAt,
  }; // real ISO times; e.g. Shanghai 07:00 and next 00:00, never guessed
  return state;
});
```

An explicitly authorized earlier start is also honored by follow priority selection through the same scoped permit check; default night denial and exclusive expiration remain. Keep all other executor fields/actions. The permit only opens the time gate: identity, quality, rolling budgets, backoff and same-ID unknown verification still apply. Resume through `followOne`/`followBatch`; do not create another ledger or submit an unknown again. Use the host automation tool to update an existing schedule only when authorized; the permit does not schedule a wakeup.

